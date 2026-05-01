import type { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../setup";
import { PaymentEntity, type PaymentNetwork, type PaymentToken } from "../entities/payment.entity";
import { UserEntity, PaymentMethod } from "../entities/user.entity";
import { getSubscriptionStatus } from "../utils/subscription";

const PRO_PRICE = 1;
const PAYMENT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const paymentRepo = () => AppDataSource.getRepository(PaymentEntity);
const userRepo = () => AppDataSource.getRepository(UserEntity);

type NetworkConfig = {
  id: PaymentNetwork;
  label: string;
  tokens: { id: PaymentToken; ticker: string }[];
  address: string | undefined;
};

const NETWORKS: NetworkConfig[] = [
  {
    id: "eth",
    label: "Ethereum (ERC-20)",
    tokens: [
      { id: "usdt", ticker: "erc20/usdt" },
      { id: "usdc", ticker: "erc20/usdc" },
    ],
    address: process.env.PAY_ADDRESS_ETH ?? "0x557E1758962e6d2e8bEA5Aa727039843E618256d",
  },
  {
    id: "bsc",
    label: "BNB Smart Chain (BEP-20)",
    tokens: [
      { id: "usdt", ticker: "bep20/usdt" },
      { id: "usdc", ticker: "bep20/usdc" },
    ],
    address: process.env.PAY_ADDRESS_BSC ?? "0x557E1758962e6d2e8bEA5Aa727039843E618256d",
  },
  {
    id: "tron",
    label: "Tron (TRC-20)",
    tokens: [
      { id: "usdt", ticker: "trc20/usdt" },
    ],
    address: process.env.PAY_ADDRESS_TRON,
  },
  {
    id: "sol",
    label: "Solana",
    tokens: [
      { id: "usdt", ticker: "sol/usdt" },
      { id: "usdc", ticker: "sol/usdc" },
    ],
    address: process.env.PAY_ADDRESS_SOL,
  },
];

function getAvailableNetworks() {
  return NETWORKS.filter((n) => n.address).map((n) => ({
    id: n.id,
    label: n.label,
    tokens: n.tokens.map((t) => t.id),
  }));
}

function resolveTickerAndAddress(network: PaymentNetwork, token: PaymentToken) {
  const net = NETWORKS.find((n) => n.id === network);
  if (!net || !net.address) return null;
  const tok = net.tokens.find((t) => t.id === token);
  if (!tok) return null;
  return { ticker: tok.ticker, address: net.address };
}

function getServerBaseUrl(req: Request): string {
  if (process.env.SERVER_URL) {
    return process.env.SERVER_URL.replace(/\/+$/, "");
  }
  const port = process.env.PORT || "4000";
  const fallback = `http://localhost:${port}`;
  console.warn(`[Payment] SERVER_URL not set — using ${fallback}. Webhooks require a public URL.`);
  return fallback;
}

export function listNetworks(_req: Request, res: Response): void {
  res.json({ networks: getAvailableNetworks(), price: PRO_PRICE });
}

async function reconcileUserPayments(userId: string): Promise<boolean> {
  const recent = await paymentRepo().find({
    where: {
      userId,
      status: In(["pending", "confirming", "expired"]),
    },
    order: { createdAt: "DESC" },
    take: 10,
  });

  for (const payment of recent) {
    try {
      const logsRes = await fetch(
        `https://api.cryptapi.io/${payment.ticker}/logs/?callback=${encodeURIComponent(payment.callbackUrl)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      const logsData = await logsRes.json() as Record<string, any>;
      if (logsData.status !== "success" || !logsData.callbacks?.length) continue;

      for (const cb of logsData.callbacks) {
        const received = parseFloat(cb.value_coin || "0");
        const confirmed = cb.logs?.find((l: { pending: boolean | number }) => !l.pending);
        if (confirmed && received >= PRO_PRICE * 0.98) {
          payment.status = "confirmed";
          payment.confirmedAt = new Date();
          payment.txidIn = cb.txid_in || payment.txidIn;
          payment.valueCoin = cb.value_coin || payment.valueCoin;
          if (cb.uuid) payment.cryptapiUuid = cb.uuid;
          await paymentRepo().save(payment);
          await userRepo().update({ uuid: userId }, { paymentMethod: PaymentMethod.PRO });
          console.log(`[Payment] RECONCILED for user ${userId}: ${cb.value_coin} ${payment.token.toUpperCase()} (${payment.network})`);
          return true;
        }
      }
    } catch { /* skip this payment, try next */ }
  }
  return false;
}

export async function createCheckout(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const network = (req.body?.network ?? "eth") as PaymentNetwork;
    const token = (req.body?.token ?? "usdt") as PaymentToken;

    const user = await userRepo().findOne({ where: { uuid: userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.paymentMethod === PaymentMethod.PRO) { res.status(400).json({ error: "Already on Pro plan" }); return; }

    const reconciled = await reconcileUserPayments(userId);
    if (reconciled) {
      const updated = await userRepo().findOne({ where: { uuid: userId } });
      res.json({ confirmed: true, subscription: updated ? getSubscriptionStatus(updated) : undefined });
      return;
    }

    const resolved = resolveTickerAndAddress(network, token);
    if (!resolved) {
      res.status(400).json({ error: `Network ${network}/${token} is not available` });
      return;
    }

    await paymentRepo()
      .createQueryBuilder()
      .update(PaymentEntity)
      .set({ status: "expired" })
      .where("userId = :userId AND status = :status", { userId, status: "pending" })
      .execute();

    const baseUrl = getServerBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/payment/webhook?user_id=${userId}`;

    const createUrl =
      `https://api.cryptapi.io/${resolved.ticker}/create/` +
      `?callback=${encodeURIComponent(callbackUrl)}` +
      `&address=${resolved.address}` +
      `&pending=1&confirmations=1&post=0&json=0&multi_token=1&convert=0`;

    const createRes = await fetch(createUrl);
    const createData = await createRes.json() as Record<string, any>;

    if (createData.status !== "success" || !createData.address_in) {
      console.error("CryptAPI create error:", createData);
      res.status(502).json({ error: createData.error || "Failed to create payment address" });
      return;
    }

    const payment = await paymentRepo().save(
      paymentRepo().create({
        userId,
        network,
        token,
        ticker: resolved.ticker,
        amount: PRO_PRICE,
        addressIn: createData.address_in,
        addressOut: resolved.address,
        callbackUrl,
        status: "pending",
        expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MS),
      })
    );

    const qrCode = await fetchQr(resolved.ticker, createData.address_in);

    res.json({
      paymentId: String(payment.id),
      addressIn: createData.address_in,
      amount: PRO_PRICE,
      network,
      token,
      networkLabel: NETWORKS.find((n) => n.id === network)!.label,
      qrCode,
      expiresAt: payment.expiresAt.toISOString(),
      status: "pending",
    });
  } catch (e) {
    console.error("createCheckout error:", e);
    res.status(500).json({ error: "Failed to create checkout" });
  }
}

async function fetchQr(ticker: string, address: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.cryptapi.io/${ticker}/qrcode/?address=${address}&value=${PRO_PRICE}&size=300`
    );
    const d = await r.json() as Record<string, any>;
    return d.status === "success" ? d.qr_code : null;
  } catch {
    return null;
  }
}

export async function cancelPayment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const paymentId = Number(req.params.id);
    if (isNaN(paymentId)) { res.status(400).json({ error: "Invalid payment id" }); return; }

    const payment = await paymentRepo().findOne({ where: { id: paymentId, userId } });
    if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

    if (payment.status === "pending" || payment.status === "confirming") {
      payment.status = "expired";
      await paymentRepo().save(payment);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("cancelPayment error:", e);
    res.status(500).json({ error: "Failed to cancel payment" });
  }
}

export async function paymentWebhook(req: Request, res: Response): Promise<void> {
  try {
    const { user_id, uuid, address_in, txid_in, txid_out, confirmations, value_coin, pending: isPending } =
      req.query as Record<string, string>;

    if (!user_id || !address_in) { res.status(200).send("*ok*"); return; }

    const payment = await paymentRepo()
      .createQueryBuilder("p")
      .where("p.userId = :userId", { userId: user_id })
      .andWhere("p.addressIn = :addressIn", { addressIn: address_in })
      .andWhere("p.status IN (:...statuses)", { statuses: ["pending", "confirming", "expired"] })
      .getOne();
    if (!payment) { res.status(200).send("*ok*"); return; }

    if (uuid) {
      const dup = await paymentRepo().findOne({ where: { cryptapiUuid: uuid, status: "confirmed" as any } });
      if (dup) { res.status(200).send("*ok*"); return; }
    }

    payment.txidIn = txid_in || payment.txidIn;
    payment.txidOut = txid_out || payment.txidOut;
    payment.valueCoin = value_coin || payment.valueCoin;
    payment.confirmations = confirmations ? Number(confirmations) : payment.confirmations;
    if (uuid) payment.cryptapiUuid = uuid;

    if (String(isPending) === "1") {
      payment.status = "confirming";
      await paymentRepo().save(payment);
      console.log(`[Payment] Pending ${payment.token.toUpperCase()} tx for user ${user_id} on ${payment.network}: ${value_coin}`);
    } else {
      const received = parseFloat(value_coin || "0");
      if (received >= PRO_PRICE * 0.98) {
        payment.status = "confirmed";
        payment.confirmedAt = new Date();
        await paymentRepo().save(payment);
        await userRepo().update({ uuid: user_id }, { paymentMethod: PaymentMethod.PRO });
        console.log(`[Payment] CONFIRMED for user ${user_id}: ${value_coin} ${payment.token.toUpperCase()} (${payment.network}) -> Pro`);
      } else {
        payment.status = "confirming";
        await paymentRepo().save(payment);
        console.log(`[Payment] Partial for user ${user_id}: ${value_coin} of ${PRO_PRICE}`);
      }
    }

    res.status(200).send("*ok*");
  } catch (e) {
    console.error("paymentWebhook error:", e);
    res.status(200).send("*ok*");
  }
}

export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const paymentId = Number(req.params.id);
    if (isNaN(paymentId)) { res.status(400).json({ error: "Invalid payment id" }); return; }

    const payment = await paymentRepo().findOne({ where: { id: paymentId, userId } });
    if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

    if (payment.status === "pending" && payment.expiresAt < new Date()) {
      payment.status = "expired";
      await paymentRepo().save(payment);
    }

    const result: Record<string, unknown> = {
      paymentId: String(payment.id),
      status: payment.status,
      amount: payment.amount,
      network: payment.network,
      token: payment.token,
      addressIn: payment.addressIn,
      expiresAt: payment.expiresAt.toISOString(),
    };

    if (payment.status === "confirmed") {
      const user = await userRepo().findOne({ where: { uuid: userId } });
      if (user) result.subscription = getSubscriptionStatus(user);
    }

    res.json(result);
  } catch (e) {
    console.error("getPaymentStatus error:", e);
    res.status(500).json({ error: "Failed to check payment status" });
  }
}

export async function checkPaymentLogs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const paymentId = Number(req.params.id);
    if (isNaN(paymentId)) { res.status(400).json({ error: "Invalid payment id" }); return; }

    const payment = await paymentRepo().findOne({ where: { id: paymentId, userId } });
    if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

    if (payment.status === "confirmed") {
      res.json({ status: "confirmed" });
      return;
    }

    const logsRes = await fetch(
      `https://api.cryptapi.io/${payment.ticker}/logs/?callback=${encodeURIComponent(payment.callbackUrl)}`
    );
    const logsData = await logsRes.json() as Record<string, any>;

    if (logsData.status !== "success" || !logsData.callbacks?.length) {
      res.json({ status: payment.status, callbacks: 0 });
      return;
    }

    for (const cb of logsData.callbacks) {
      const received = parseFloat(cb.value_coin || "0");
      const confirmed = cb.logs?.find((l: { pending: boolean | number }) => !l.pending);

      if (confirmed && received >= PRO_PRICE * 0.98) {
        payment.status = "confirmed";
        payment.confirmedAt = new Date();
        payment.txidIn = cb.txid_in || payment.txidIn;
        payment.valueCoin = cb.value_coin || payment.valueCoin;
        if (cb.uuid) payment.cryptapiUuid = cb.uuid;
        await paymentRepo().save(payment);

        await userRepo().update({ uuid: userId }, { paymentMethod: PaymentMethod.PRO });
        console.log(`[Payment] CONFIRMED via logs for user ${userId}: ${cb.value_coin} ${payment.token.toUpperCase()} (${payment.network})`);

        const user = await userRepo().findOne({ where: { uuid: userId } });
        res.json({ status: "confirmed", subscription: user ? getSubscriptionStatus(user) : undefined });
        return;
      }

      if (received > 0 && payment.status === "pending") {
        payment.status = "confirming";
        payment.txidIn = cb.txid_in || payment.txidIn;
        payment.valueCoin = cb.value_coin || payment.valueCoin;
        await paymentRepo().save(payment);
      }
    }

    res.json({ status: payment.status, callbacks: logsData.callbacks.length });
  } catch (e) {
    console.error("checkPaymentLogs error:", e);
    res.status(500).json({ error: "Failed to check payment logs" });
  }
}
