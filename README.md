🧩 SQL Query Generator AI (Multi-Database Architecture)

A full-stack AI-powered SQL Query Generator built using NestJS, React (Vite), PostgreSQL (multi-database), Prisma, and Ollama embeddings.
Now supports dynamic connection switching between multiple hospital databases (e.g., rs_a_db, rs_b_db, rs_c_db, rs_d_db), each with its own schema and data.

🚀 Tech Stack Overview
🔹 Backend

NestJS — scalable backend framework using TypeScript

Prisma ORM — for schema modeling and multi-database management

PostgreSQL (Docker) — containerized DB supporting multiple hospitals

Ollama — local embedding model (nomic / bge)

OpenRouter (Gemma) — LLM for SQL generation

🔹 Frontend

React + Vite — modern UI for query input & results display

TailwindCSS — responsive and fast UI styling

⚙️ Key Features

✅ AI-generated SQL queries from natural language
✅ Dynamic Prisma Client per hospital database (e.g., rs_a_db, rs_b_db, etc.)
✅ Schema separation (public, rag) for modular knowledge base
✅ Real-time SQL execution and visualization
✅ Integrated embedding system for context-aware query generation

🧠 Architecture Overview
User Query → Frontend (React)
             ↓
       Backend (NestJS)
             ↓
   Dynamic Database Selector
             ↓
      Prisma (multi-client)
             ↓
  Embedding Generator (Ollama)
             ↓
   Gemma via OpenRouter (SQL Gen)
             ↓
 PostgreSQL Databases (rs_a_db, rs_b_db, etc.)
             ↓
         Query Results → UI

🌍 Environment Setup

Create a file .env inside backend/:

# ===============================
# 🌐 DATABASE CONFIGURATION
# ===============================
# Default DB (system metadata)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/rsmu_db?schema=public"

# Used by Prisma Migrations
SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/rsmu_shadow?schema=public"

# ===============================
# 🧠 AI + EMBEDDING CONFIG
# ===============================
OLLAMA_URL="http://localhost:11434"
OPENROUTER_API_KEY="your-openrouter-api-key-here"

# ===============================
# ⚙️ APP CONFIGURATION
# ===============================
PORT=3000
FRONTEND_URL="http://localhost:5173"


Each hospital database follows naming like:

rs_a_db
rs_b_db
rs_c_db
rs_d_db


Each may contain schema:

public  — general system data
rag     — embedding knowledge base

🐳 Running the Project
1️⃣ Clone the Repository
git clone https://github.com/Dindamaharn/LLM-Project-SQL-Query-Generator.git
cd LLM-Project-SQL-Query-Generator

2️⃣ Start the Database (Docker)
docker compose up -d


Database available at:
localhost:5433

3️⃣ Backend Setup
cd backend
npm install
npx prisma migrate dev --name init
npm run start:dev


Backend runs at:
http://localhost:3000

4️⃣ Frontend Setup
cd ../frontend
npm install
npm run dev


Frontend runs at:
http://localhost:5173

🧩 Example Workflow

1️⃣ User inputs:

“Tampilkan semua pasien yang dirawat bulan lalu di RS_C”

2️⃣ System flow:

Menentukan database aktif (rs_c_db)

Menggunakan embedding model (Ollama BGE)

Mengirim prompt ke Gemma via OpenRouter

Menghasilkan SQL otomatis

Menjalankan query di schema yang sesuai (rag/public)

Menampilkan hasil ke frontend