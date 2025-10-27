import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Database,
  Search,
  Code,
  Table,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function App() {
  const [databases, setDatabases] = useState([]); // daftar database dari backend
  const [selectedDb, setSelectedDb] = useState(""); // database yang dipilih user
  const [query, setQuery] = useState("");
  const [sql, setSql] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // 🔹 Ambil daftar database dari backend saat komponen pertama kali dimuat
  useEffect(() => {
  const fetchDatabases = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/databases");
      const result = await res.json();

      if (result.success && Array.isArray(result.data)) {
        setDatabases(result.data);
        if (result.data.length > 0) {
          setSelectedDb(result.data[0]);
        }
      } else {
        console.warn("Respons tidak sesuai:", result);
      }
    } catch (err) {
      console.error("Gagal mengambil daftar database:", err);
    }
  };

  fetchDatabases();
}, []);

  // 🔹 Jalankan query ke backend
  const handleSearch = async () => {
    if (!selectedDb) {
      alert("Pilih database terlebih dahulu!");
      return;
    }
    if (!query.trim()) return;

    setLoading(true);
    setSql("");
    setResults([]);

    try {
      const response = await fetch("http://localhost:3000/query/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          dbName: selectedDb, // kirim nama database ke backend
        }),
      });

      const data = await response.json();
      setSql(data.sql || "Tidak ada query yang dihasilkan.");
      setResults(data.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
      setSql("Terjadi kesalahan koneksi ke backend.");
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Scroll tabel hasil
  const scrollTable = (direction) => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-b from-sky-50 to-white">
      {/* HEADER */}
      <header className="w-full border-b bg-white/80 backdrop-blur-lg shadow-sm">
        <div className="flex items-center gap-3 py-4 px-6">
          <Database className="w-8 h-8 text-sky-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">
              Query Generator
            </h1>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-grow flex justify-center px-10 py-10 overflow-hidden">
        <div className="w-full max-w-[1600px] flex flex-col lg:flex-row items-start gap-10">
          {/* KIRI: INPUT */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/90 shadow-xl rounded-2xl p-8 border border-gray-100 flex flex-col justify-between h-fit w-full max-w-[480px]"
          >
            <div>
              {/* Dropdown Database */}
              <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800 mb-2">
                <Database className="w-5 h-5 text-sky-600" />
                Pilih Database
              </h2>
              <select
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-5 
                          text-gray-800 bg-white shadow-sm hover:border-sky-400 
                          focus:ring-2 focus:ring-sky-500 focus:border-sky-500 
                          focus:outline-none transition duration-150 appearance-none"
              >
                {databases.length > 0 ? (
                  databases.map((db) => (
                    <option key={db} value={db} className="bg-white text-gray-800">
                      {db}
                    </option>
                  ))
                ) : (
                  <option className="bg-white text-gray-500 italic">
                    Memuat database...
                  </option>
                )}
              </select>


              {/* Textarea Pertanyaan */}
              <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800 mb-4">
                <Search className="w-5 h-5 text-sky-600" />
                Masukkan Pertanyaan Anda
              </h2>

              <Textarea
                className="w-full min-h-[180px] max-h-[280px] overflow-y-auto text-gray-800 text-base resize-y"
                placeholder="contoh: tampilkan data pasien laki-laki berusia di atas 40 tahun"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 text-base rounded-lg flex items-center"
                onClick={handleSearch}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" /> Cari Data
                  </>
                )}
              </Button>
            </div>
          </motion.div>

          {/* KANAN: SQL + HASIL */}
          <div className="flex flex-col gap-8 flex-1 min-w-0 overflow-hidden">
            {/* QUERY SQL */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 shadow-xl rounded-2xl p-8 border border-gray-100"
            >
              <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800 mb-4">
                <Code className="w-5 h-5 text-sky-600" />
                Query SQL yang Dihasilkan
              </h2>

              <div className="bg-gray-50 p-4 rounded-md font-mono text-sm text-gray-700 border border-gray-200 min-h-[120px] overflow-x-auto">
                {loading
                  ? "⏳ Sedang memproses permintaan..."
                  : sql
                  ? sql
                  : "Belum ada query. Silakan ketik pertanyaan dan klik Cari Data."}
              </div>
            </motion.div>

            {/* HASIL */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 shadow-xl rounded-2xl p-8 border border-gray-100 flex flex-col relative overflow-hidden"
            >
              <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800 mb-4">
                <Table className="w-5 h-5 text-sky-600" />
                Hasil Pencarian
              </h2>

              {loading ? (
                <p className="text-sm text-gray-500 italic">
                  🔍 Sedang mengambil data...
                </p>
              ) : results.length > 0 ? (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    ✅ {results.length} data ditemukan
                  </p>

                  <div
                    ref={scrollRef}
                    className="relative border border-gray-200 rounded-md bg-white max-h-[480px] overflow-auto scroll-smooth min-w-0"
                  >
                    <div className="inline-block min-w-full align-middle">
                      <table className="text-xs text-gray-700 border-collapse min-w-[900px]">
                        <thead className="bg-sky-50 text-sky-900 sticky top-0 z-10">
                          <tr>
                            {Object.keys(results[0]).map((key) => (
                              <th
                                key={key}
                                className="px-3 py-2 text-left font-semibold border-b border-gray-200 whitespace-nowrap"
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((row, i) => (
                            <tr
                              key={i}
                              className={`${
                                i % 2 === 0 ? "bg-white" : "bg-gray-50"
                              } hover:bg-sky-50 transition-colors`}
                            >
                              {Object.values(row).map((val, j) => (
                                <td
                                  key={j}
                                  className="px-3 py-2 border-b border-gray-100 whitespace-nowrap"
                                >
                                  {String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-center items-center gap-2 mt-2 text-sky-500 text-xs pb-2">
                    <ArrowLeft className="w-4 h-4" />
                    <span>Geser ke kanan / kiri untuk melihat semua kolom</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Belum ada hasil. Silakan masukkan pertanyaan dan tekan tombol
                  “Cari Data”.
                </p>
              )}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
