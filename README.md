# 🧩 SQL Query Generator AI

A full-stack AI-powered SQL Generator built using **NestJS**, **React (Vite)**, **PostgreSQL**, **Prisma**, and **Ollama** embeddings.  
This project automatically generates SQL queries from natural language using **Gemma (via OpenRouter)** and executes them on a real PostgreSQL database.

---

## 🚀 Tech Stack Overview

### 🔹 Backend
- **NestJS** — TypeScript-based backend framework  
- **Prisma ORM** — database management and schema modeling  
- **Docker + PostgreSQL** — containerized database  
- **Ollama** — embedding generation (`nomic` and `bge` models)  
- **OpenRouter (Gemma)** — LLM model for SQL query generation  

### 🔹 Frontend
- **React + Vite** — modern UI for generating and displaying queries  
- **TailwindCSS** — fast and responsive styling  

---

## ⚙️ Key Features
✅ Generate SQL queries automatically from natural language  
✅ Store and manage embedding knowledge base using Prisma  
✅ Execute generated SQL queries on PostgreSQL  
✅ Display query results directly in the frontend  
✅ Modular architecture for easy development and scaling  

---

## 🧰 Project Structure
LLM-Project-SQL-Query-Generator/
│
├── backend/ # NestJS backend (API, Prisma, Embedding logic)
│ ├── src/
│ ├── prisma/
│ ├── .env
│ ├── package.json
│ └── tsconfig.json
│
├── frontend/ # React Vite frontend
│ ├── src/
│ ├── public/
│ ├── package.json
│ └── vite.config.js
│
├── database/ # Docker PostgreSQL setup
├── knowledge-base/ # JSON knowledge base (embeddings)
├── docker-compose.yml
└── README.md

makefile
Salin kode

---

## 🌍 Environment Setup

Buat file **`.env`** di folder `backend/` dengan isi seperti ini 👇  
(Jangan upload `.env` ke GitHub, upload hanya `.env.example`)

### 🔸 `.env.example`
```env
# ===============================
# 🌐 DATABASE CONFIGURATION
# ===============================
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sql_generator_ai?schema=public"
SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sql_generator_ai_shadow?schema=public"

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
🐳 Running the Project
1️⃣ Clone the Repository
bash
Salin kode
git clone https://github.com/Dindamaharn/LLM-Project-SQL-Query-Generator.git
cd LLM-Project-SQL-Query-Generator
2️⃣ Setup the Database (Docker)
bash
Salin kode
docker compose up -d
Database runs on:

makefile
Salin kode
localhost:5433
3️⃣ Backend Setup
bash
Salin kode
cd backend
npm install
Initialize Prisma:

bash
Salin kode
npx prisma migrate dev --name init
Run the backend:

bash
Salin kode
npm run start:dev
Backend should run at:

arduino
Salin kode
http://localhost:3000
4️⃣ Frontend Setup
bash
Salin kode
cd ../frontend
npm install
npm run dev
Frontend will start at:

arduino
Salin kode
http://localhost:5173
🧩 Example Workflow
1️⃣ User inputs a natural language query, e.g.:

“Show all books borrowed in July.”

2️⃣ The system:

Uses Ollama embeddings (nomic / bge) to understand schema and stored knowledge base

Sends a prompt to Gemma (via OpenRouter) to generate the corresponding SQL

Executes SQL on PostgreSQL

Returns query results to frontend in real-time

🧠 System Flow
text
Salin kode
User Query  →  Frontend (React)
             ↓
       Backend (NestJS)
             ↓
   Ollama Embedding Model
             ↓
     Gemma via OpenRouter
             ↓
   SQL Generation + Execution
             ↓
  PostgreSQL Database (Docker)
             ↓
        Results to UI