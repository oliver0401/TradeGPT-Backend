import "dotenv/config";
import { AppDataSource } from "./setup";
import { dbCreate } from "./utils/dbCreate";
import { createApp } from "./app";

const PORT = Number(process.env.PORT) || 4000;

if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment");
  process.exit(1);
}

const setupServer = async () => {
  try {
    await dbCreate();
    console.log("Database ensured");
    await AppDataSource.initialize();
    await AppDataSource.synchronize();
    console.log("Connected to MySQL");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }

  try {
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
  }
};

setupServer();
