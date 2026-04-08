import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const DATA_FILE = path.join(process.cwd(), "data", "employees.json");
  
  // Ensure data directory exists
  if (!fs.existsSync(path.join(process.cwd(), "data"))) {
    fs.mkdirSync(path.join(process.cwd(), "data"));
  }

  // Load employees from file
  app.get("/api/employees", (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const data = fs.readFileSync(DATA_FILE, "utf8");
        return res.json(JSON.parse(data));
      } catch (error) {
        console.error("Error reading employees file:", error);
      }
    }
    res.json([]); // Return empty if no file
  });

  // Save employees to file (and sync to GSheet)
  app.post("/api/employees", async (req, res) => {
    try {
      const { allEmployees, ...newEmployeeData } = req.body;
      const { name, position, type, rosterPattern, offDays, startDate, manualOverrides, operation = "ADD" } = newEmployeeData;

      // Save all employees to local file for persistence
      if (allEmployees) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(allEmployees, null, 2));
      }

      // Check if credentials are set for GSheet sync
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.warn("Google Sheets credentials not configured. Skipping GDrive sync.");
        return res.status(200).json({ 
          success: true, 
          message: "Employee data saved locally, but GDrive sync skipped (credentials missing)." 
        });
      }

      // Robust private key parsing
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;
      if (privateKey) {
        privateKey = privateKey.trim();
        // Remove surrounding quotes if present
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.substring(1, privateKey.length - 1);
        }
        // Replace literal \n with actual newlines
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      if (!privateKey || !privateKey.includes("BEGIN PRIVATE KEY")) {
        console.warn("Google Private Key format may be invalid (missing 'BEGIN PRIVATE KEY' header).");
      }

      // Lazy initialization of Google Sheets API
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: privateKey,
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });
      const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || "1Pg7jCJwl8yUjF9weGILaiwFs-m73Q5uhOy4mY52BFlU";

      const values = [
        [
          new Date().toLocaleString("id-ID"),
          operation,
          name,
          position,
          type,
          rosterPattern ? rosterPattern.join(",") : "",
          offDays ? offDays.join(",") : "",
          startDate,
          manualOverrides ? JSON.stringify(manualOverrides) : ""
        ]
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Sheet1!A:I", // Extended range for operation and overrides
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values,
        },
      });

      res.json({ success: true, message: `Employee ${operation} synced to GDrive.` });
    } catch (error) {
      console.error("Error syncing to Google Sheets:", error);
      // We return 200 even if sync fails so the frontend doesn't break, 
      // but we include the error info.
      res.status(200).json({ 
        success: false, 
        message: "Employee added locally, but failed to sync to GDrive.",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
