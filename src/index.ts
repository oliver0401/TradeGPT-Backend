import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment (copy server/.env.example to server/.env)");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log("Connected to MongoDB");

const app = createApp();
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
