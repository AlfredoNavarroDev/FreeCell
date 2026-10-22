import path from "node:path";
import dotenv from "dotenv";

export default function globalSetup(): void {
  dotenv.config({ path: path.resolve(__dirname, "../../backend/.env") });
}
