import React, { useState, useEffect } from 'react';
import { 
  BookOpen, LogOut, Plus, Search, CheckCircle, XCircle, 
  Clock, Book, ArrowRightLeft, Trash2, Edit, LayoutDashboard, Users,
  KeyRound, ShieldCheck, RefreshCw, Menu, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, 
  doc, onSnapshot, query, serverTimestamp 
} from 'firebase/firestore';

// Menonaktifkan peringatan ESLint
/* eslint-disable no-unused-vars */

// --- KONFIGURASI FIREBASE ---
// Gunakan environment variables atau konfigurasi default jika di lingkungan canvas
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Fallback untuk environment Canvas jika env vars kosong
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Gunakan ID aplikasi global atau default
const APP_DATA_ID = typeof __app_id !== 'undefined' ? __app_id : 'edulib-v1';

export default function App() {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);
  const [view, setView] = useState('login');
  
  // UI States
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State untuk menu mobile
  const [currentBook, setCurrentBook] = useState(null); 

  useEffect(() => {
    const initAuth = async () => {
      try { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth); 
        }
      } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  useEffect(() => {
    if (!user) return;
    // Menggunakan APP_DATA_ID untuk memisahkan data jika perlu, atau string statis
    const appIdToUse = APP_DATA_ID;

    const booksRef = collection(db, 'libraries', appIdToUse, 'books');
    const unsubBooks = onSnapshot(query(booksRef), (s) => setBooks(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    const transRef = collection(db, 'libraries', appIdToUse, 'transactions');
    const unsubTrans = onSnapshot(query(transRef), (s) => setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))));

    const studentsRef = collection(db, 'libraries', appIdToUse, 'students');
    const unsubStudents = onSnapshot(query(studentsRef), (s) => setStudents(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubBooks(); unsubTrans(); unsubStudents(); };
  }, [user]);

  // --- LOGIC AUTH & USER ---

  const handleLogin = (role, credentials) => {
    if (role === 'admin') {
      if (credentials.username === 'admin' && credentials.password === 'admin123') {
        setAppUser({ role: 'admin', name: 'Administrator', id: 'admin-01' });
        setView('admin-dashboard');
      } else {
        alert("Admin: Username atau Password salah!");
      }
    } else {
      // Login Siswa dengan Password
      const found = students.find(s => s.nisn === credentials.nisn);
      if (found) {
        if (found.password === credentials.password) {
          setAppUser({ role: 'student', name: found.name, nisn: found.nisn, id: found.id });
          setView('student-dashboard');
        } else {
          alert("Password salah!");
        }
      } else {
        alert("NISN tidak terdaftar! Hubungi admin.");
      }
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newPass = formData.get('newPassword');
    const confirmPass = formData.get('confirmPassword');

    if (newPass !== confirmPass) return alert("Konfirmasi password tidak cocok!");
    if (newPass.length < 4) return alert("Password minimal 4 karakter.");

    try {
      await updateDoc(doc(db, 'libraries', APP_DATA_ID, 'students', appUser.id), {
        password: newPass
      });
      alert("Password berhasil diubah!");
      setIsPasswordModalOpen(false);
    } catch (error) {
      alert("Gagal mengubah password.");
    }
  };

  // --- LOGIC BUKU ---

  const handleSaveBook = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const bookData = {
      title: formData.get('title'),
      author: formData.get('author'),
      category: formData.get('category') || 'Umum',
      stock: parseInt(formData.get('stock')),
      cover: formData.get('cover') || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=200&auto=format&fit=crop'
    };

    try {
      if (currentBook) {
        await updateDoc(doc(db, 'libraries', APP_DATA_ID, 'books', currentBook.id), bookData);
      } else {
        await addDoc(collection(db, 'libraries', APP_DATA_ID, 'books'), { ...bookData, createdAt: serverTimestamp() });
      }
      setIsBookModalOpen(false);
      setCurrentBook(null);
    } catch (e) { alert("Gagal menyimpan buku."); }
  };

  const handleDeleteBook = async (id) => {
    if(!window.confirm("Hapus buku ini?")) return;
    await deleteDoc(doc(db, 'libraries', APP_DATA_ID, 'books', id));
  };

  // --- LOGIC TRANSAKSI ---

  const requestBorrow = async (book) => {
    if (book.stock < 1) return alert("Stok habis.");
    const existing = transactions.find(t => t.studentNisn === appUser.nisn && t.bookId === book.id && ['pending_borrow','borrowed','pending_return'].includes(t.status));
    if (existing) return alert("Anda sedang meminjam buku ini.");

    await addDoc(collection(db, 'libraries', APP_DATA_ID, 'transactions'), {
      bookId: book.id, bookTitle: book.title, studentName: appUser.name, studentNisn: appUser.nisn,
      status: 'pending_borrow', requestDate: new Date().toISOString(), createdAt: serverTimestamp()
    });
    alert("Berhasil diajukan!");
  };

  const requestReturn = async (id) => {
    await updateDoc(doc(db, 'libraries', APP_DATA_ID, 'transactions', id), { status: 'pending_return' });
    alert("Pengembalian diajukan.");
  };

  const handleTransactionAction = async (trans, action) => {
    const tRef = doc(db, 'libraries', APP_DATA_ID, 'transactions', trans.id);
    const bRef = doc(db, 'libraries', APP_DATA_ID, 'books', trans.bookId);
    const book = books.find(b => b.id === trans.bookId);

    if (action === 'approve_borrow') {
      if (!book || book.stock < 1) return alert("Stok habis.");
      await updateDoc(bRef, { stock: book.stock - 1 });
      await updateDoc(tRef, { status: 'borrowed' });
    } else if (action === 'reject_borrow') {
      await updateDoc(tRef, { status: 'rejected' });
    } else if (action === 'confirm_return') {
      if (book) await updateDoc(bRef, { stock: book.stock + 1 });
      await updateDoc(tRef, { status: 'returned' });
    }
  };

  const navigateTo = (newView) => {
    setView(newView);
    setIsMobileMenuOpen(false); // Tutup menu saat navigasi di mobile
  };

  // --- RENDER ---

  if (authLoading) return <div className="flex h-screen items-center justify-center font-sans text-slate-500 animate-pulse">Memuat EduLib...</div>;

  if (!appUser) return (
    <LoginScreen 
      onLogin={handleLogin} 
      roleType={view === 'login' ? 'student' : 'admin'} 
      setRoleType={(r) => setView(r === 'student' ? 'login' : 'admin_login')} 
    />
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans relative">
      
      {/* --- MOBILE HEADER BAR --- */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 text-white flex items-center justify-between px-4 z-40 shadow-md">
        <div className="flex items-center gap-2">
           <BookOpen className="text-blue-400" size={24} />
           <span className="font-bold text-lg tracking-tight">EduLib</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-300 hover:text-white">
          <Menu size={28} />
        </button>
      </div>

      {/* --- OVERLAY UNTUK MOBILE MENU --- */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* --- SIDEBAR (RESPONSIVE) --- */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
          <BookOpen className="text-blue-400" />
          <span className="font-bold text-xl tracking-tight">EduLib</span>
          {/* Tombol tutup khusus mobile di dalam sidebar */}
          <button onClick={() => setIsMobileMenuOpen(false)} className="ml-auto md:hidden text-slate-400">
            <X size={24} />
          </button>
        </div>

        <nav className="p-4 flex-1 space-y-2 overflow-y-auto">
          {appUser.role === 'admin' ? (
            <>
              <NavItem active={view === 'admin-dashboard'} onClick={() => navigateTo('admin-dashboard')} icon={<LayoutDashboard size={20}/>} label="Dashboard" />
              <NavItem active={view === 'admin-books'} onClick={() => navigateTo('admin-books')} icon={<Book size={20}/>} label="Buku" />
              <NavItem active={view === 'admin-students'} onClick={() => navigateTo('admin-students')} icon={<Users size={20}/>} label="Siswa" />
            </>
          ) : (
            <>
              <NavItem active={view === 'student-dashboard'} onClick={() => navigateTo('student-dashboard')} icon={<Search size={20}/>} label="Katalog" />
              <NavItem active={view === 'student-history'} onClick={() => navigateTo('student-history')} icon={<Clock size={20}/>} label="Pinjaman Saya" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-900/50">
          <div className="px-2 mb-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Login sebagai</div>
            <div className="text-sm font-medium truncate text-slate-200">{appUser.name}</div>
          </div>
          
          {appUser.role === 'student' && (
            <button 
              onClick={() => { setIsPasswordModalOpen(true); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center gap-3 p-2 text-blue-400 hover:bg-slate-800 rounded-lg text-sm transition-colors"
            >
              <KeyRound size={16} /> Ganti Password
            </button>
          )}

          <button onClick={() => { setAppUser(null); setView('login'); }} className="w-full flex items-center gap-3 p-2 text-red-400 hover:bg-red-900/20 rounded-lg text-sm transition-colors">
            <LogOut size={16} /> Keluar
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full">
          {view === 'admin-dashboard' && <AdminDash transactions={transactions} onAction={handleTransactionAction} />}
          {view === 'admin-books' && <BookList books={books} onAdd={() => {setCurrentBook(null); setIsBookModalOpen(true)}} onDelete={handleDeleteBook} onEdit={(b) => {setCurrentBook(b); setIsBookModalOpen(true)}} />}
          {view === 'admin-students' && <StudentManagement students={students} db={db} appId={APP_DATA_ID} />}
          {view === 'student-dashboard' && <Catalog books={books} transactions={transactions} userNisn={appUser.nisn} onBorrow={requestBorrow} />}
          {view === 'student-history' && <History transactions={transactions.filter(t => t.studentNisn === appUser.nisn)} onReturn={requestReturn} />}
        </div>
      </main>

      {/* --- MODALS --- */}
      {isBookModalOpen && <BookModal onClose={() => setIsBookModalOpen(false)} onSave={handleSaveBook} data={currentBook} />}

      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <form onSubmit={handleChangePassword} className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Ganti Password</h3>
            <div className="space-y-3">
              <input type="password" name="newPassword" placeholder="Password Baru" className="w-full border p-3 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
              <input type="password" name="confirmPassword" placeholder="Konfirmasi Password" className="w-full border p-3 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="flex-1 border border-slate-200 p-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">Batal</button>
              <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg text-sm font-medium">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// --- SUB COMPONENTS (RESPONSIVE ADJUSTMENTS) ---

function NavItem({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
      {icon} <span className="font-medium">{label}</span>
    </button>
  );
}

function LoginScreen({ onLogin, roleType, setRoleType }) {
  const [data, setData] = useState({ username: '', password: '', nisn: '' });
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/20">
                <BookOpen size={32} />
            </div>
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center text-slate-800">EduLib Login</h2>
        <p className="text-center text-slate-400 text-sm mb-6">Masuk untuk mengakses perpustakaan</p>
        
        <div className="flex mb-6 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setRoleType('student')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${roleType === 'student' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Siswa</button>
          <button onClick={() => setRoleType('admin')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${roleType === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Admin</button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); onLogin(roleType, data); }} className="space-y-4">
          {roleType === 'student' ? (
            <>
              <div>
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">NISN</label>
                  <input type="number" placeholder="Contoh: 12345" className="w-full border p-3 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required onChange={e => setData({...data, nisn: e.target.value})} />
              </div>
              <div>
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
                  <input type="password" placeholder="••••••••" className="w-full border p-3 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required onChange={e => setData({...data, password: e.target.value})} />
              </div>
            </>
          ) : (
            <>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Username</label><input placeholder="Username" className="w-full border p-3 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500 outline-none" required onChange={e => setData({...data, username: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label><input type="password" placeholder="Password" className="w-full border p-3 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500 outline-none" required onChange={e => setData({...data, password: e.target.value})} /></div>
            </>
          )}
          <button className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-600/30 mt-4 transition-all duration-200">Masuk</button>
        </form>
      </div>
    </div>
  );
}

function StudentManagement({ students, db, appId }) {
  // Tambah Siswa Baru
  const addStudent = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nisn = f.get('nisn');
    const name = f.get('name');
    const password = f.get('password');
    
    if (students.find(s => s.nisn === nisn)) return alert("NISN sudah terdaftar!");
    
    await addDoc(collection(db, 'libraries', appId, 'students'), { 
      nisn, name, password, createdAt: serverTimestamp() 
    });
    e.target.reset();
    alert("Siswa berhasil ditambahkan!");
  };

  const resetPassword = async (id, name) => {
    const newPass = prompt(`Masukkan password baru untuk siswa: ${name}`);
    if (newPass && newPass.length >= 4) {
      await updateDoc(doc(db, 'libraries', appId, 'students', id), { password: newPass });
      alert("Password siswa berhasil direset.");
    } else if (newPass) {
      alert("Password terlalu pendek (min 4 karakter).");
    }
  };

  const delStudent = async (id) => {
    if(!window.confirm("Hapus data siswa?")) return;
    await deleteDoc(doc(db, 'libraries', appId, 'students', id));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Manajemen Siswa</h1>
            <p className="text-slate-500 text-sm">Kelola akses login siswa.</p>
        </div>
      </header>

      {/* Form Tambah Siswa Responsif */}
      <form onSubmit={addStudent} className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-3">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">NISN</label>
          <input name="nisn" type="number" placeholder="12345" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
        </div>
        <div className="md:col-span-4">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nama Lengkap</label>
          <input name="name" placeholder="Nama Siswa" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Password Awal</label>
          <input name="password" type="text" placeholder="Min. 4 char" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
        </div>
        <div className="md:col-span-2">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold transition-colors">Tambah</button>
        </div>
      </form>

      {/* Tabel dengan Horizontal Scroll */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                <tr><th className="px-6 py-4">NISN</th><th className="px-6 py-4">Nama</th><th className="px-6 py-4">Password</th><th className="px-6 py-4 text-right">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {students.length === 0 ? (
                    <tr><td colSpan="4" className="text-center py-8 text-slate-400">Belum ada data siswa.</td></tr>
                ) : students.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-blue-600">{s.nisn}</td>
                    <td className="px-6 py-4 font-semibold text-slate-700">{s.name}</td>
                    <td className="px-6 py-4 font-mono text-slate-400">••••••</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button onClick={() => resetPassword(s.id, s.name)} className="text-blue-600 text-xs font-bold flex items-center gap-1 hover:bg-blue-50 p-1 rounded">
                        <RefreshCw size={14}/> Reset
                    </button>
                    <button onClick={() => delStudent(s.id)} className="text-red-600 text-xs font-bold flex items-center gap-1 hover:bg-red-50 p-1 rounded">
                        <Trash2 size={14}/> Hapus
                    </button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

function AdminDash({ transactions, onAction }) {
  const pB = transactions.filter(t => t.status === 'pending_borrow');
  const pR = transactions.filter(t => t.status === 'pending_return');
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
        <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft size={20} className="text-orange-500"/> Permintaan Peminjaman</h3>
            <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded-full text-xs font-bold">{pB.length}</span>
        </div>
        
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {pB.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">Tidak ada permintaan baru.</div>}
            {pB.map(t=>(
                <div key={t.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                        <div className="font-bold text-sm text-slate-800 line-clamp-1">{t.bookTitle}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1"><Users size={12}/> {t.studentName}</div>
                    </div>
                    <div className="flex gap-2 self-end sm:self-auto">
                        <button onClick={()=>onAction(t,'approve_borrow')} className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold hover:bg-green-200 transition-colors">
                            <CheckCircle size={14}/> Terima
                        </button>
                        <button onClick={()=>onAction(t,'reject_borrow')} className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors">
                            <XCircle size={14}/> Tolak
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>

      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
        <div className="flex items-center justify-between mb-4">
             <h3 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle size={20} className="text-blue-500"/> Pengembalian</h3>
             <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-xs font-bold">{pR.length}</span>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {pR.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">Tidak ada pengembalian pending.</div>}
            {pR.map(t=>(
                <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                        <div className="font-bold text-sm text-slate-800 line-clamp-1">{t.bookTitle}</div>
                        <div className="text-xs text-slate-500">{t.studentName}</div>
                    </div>
                    <button onClick={()=>onAction(t,'confirm_return')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
                        Verifikasi
                    </button>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function BookList({ books, onAdd, onDelete, onEdit }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
      <div className="p-4 md:p-6 border-b flex justify-between items-center bg-white rounded-t-2xl sticky top-0 z-10">
          <h3 className="font-bold text-lg text-slate-800">Daftar Buku</h3>
          <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors font-medium">
              <Plus size={16}/> <span className="hidden sm:inline">Tambah Buku</span>
          </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr><th className="p-4">Judul Buku</th><th className="p-4">Kategori</th><th className="p-4 text-center">Stok</th><th className="p-4 text-right">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {books.length === 0 && <tr><td colSpan="4" className="text-center p-8 text-slate-400">Belum ada data buku.</td></tr>}
                {books.map(b=>(
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                            <div className="font-bold text-slate-800">{b.title}</div>
                            <div className="text-xs text-slate-500">{b.author}</div>
                        </td>
                        <td className="p-4 text-slate-600"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{b.category}</span></td>
                        <td className="p-4 text-center font-mono font-medium">{b.stock}</td>
                        <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                                <button onClick={()=>onEdit(b)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit size={16}/></button>
                                <button onClick={()=>onDelete(b.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={16}/></button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}

function Catalog({ books, transactions, userNisn, onBorrow }) {
  // Grid responsif: 1 kolom di HP kecil, 2 di HP besar, 3 di tablet, 4 di desktop
  return (
    <>
      <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800">Katalog Buku</h2>
          <p className="text-slate-500 text-sm">Temukan buku favoritmu di sini.</p>
      </div>
      {books.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
              <Book size={48} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500">Belum ada buku tersedia saat ini.</p>
          </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-20">
        {books.map(b=>{
            const active = transactions.find(t=>t.bookId===b.id && t.studentNisn===userNisn && ['pending_borrow','borrowed','pending_return'].includes(t.status));
            return (
            <div key={b.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow">
            <div className="aspect-[3/4] bg-slate-100 rounded-xl mb-4 overflow-hidden relative group">
                <img src={b.cover} alt={b.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" onError={(e)=>{e.target.src='https://placehold.co/400x600?text=No+Cover'}}/>
                {b.stock < 1 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold backdrop-blur-[2px]">Stok Habis</div>}
            </div>
            <h4 className="font-bold text-slate-800 line-clamp-1 mb-1" title={b.title}>{b.title}</h4>
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><Users size={12}/> {b.author}</p>
            
            <div className="mt-auto flex justify-between items-center pt-3 border-t border-slate-50">
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${b.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    Stok: {b.stock}
                </span>
                {active ? (
                    <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
                        <CheckCircle size={12}/> Dipinjam
                    </span>
                ) : (
                    <button 
                        onClick={()=>onBorrow(b)} 
                        disabled={b.stock<1} 
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-bold disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm shadow-blue-200"
                    >
                        Pinjam
                    </button>
                )}
            </div>
            </div>
        )})}
        </div>
      )}
    </>
  );
}

function History({ transactions, onReturn }) {
  return (
    <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">Riwayat Peminjaman</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                    <tr><th className="p-4">Tanggal</th><th className="p-4">Buku</th><th className="p-4">Status</th><th className="p-4 text-right">Aksi</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {transactions.length === 0 && <tr><td colSpan="4" className="text-center p-8 text-slate-400">Belum ada riwayat peminjaman.</td></tr>}
                    {transactions.map(t=>(
                    <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-500 text-xs whitespace-nowrap">
                            {t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="p-4 font-bold text-slate-800">{t.bookTitle}</td>
                        <td className="p-4">
                            <StatusBadge status={t.status} />
                        </td>
                        <td className="p-4 text-right">
                            {t.status==='borrowed'&& (
                                <button onClick={()=>onReturn(t.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm shadow-blue-200">
                                    Kembalikan
                                </button>
                            )}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
        </div>
    </div>
  );
}

function StatusBadge({ status }) {
    const styles = {
        'pending_borrow': 'bg-orange-100 text-orange-700',
        'borrowed': 'bg-blue-100 text-blue-700',
        'pending_return': 'bg-yellow-100 text-yellow-700',
        'returned': 'bg-green-100 text-green-700',
        'rejected': 'bg-red-100 text-red-700'
    };
    const labels = {
        'pending_borrow': 'Menunggu Konfirmasi',
        'borrowed': 'Sedang Dipinjam',
        'pending_return': 'Proses Kembali',
        'returned': 'Selesai',
        'rejected': 'Ditolak'
    };
    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
            {labels[status] || status}
        </span>
    );
}

function BookModal({ onClose, onSave, data }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <form onSubmit={onSave} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
        <h3 className="font-bold text-xl text-slate-800">{data?'Edit Data':'Tambah Buku Baru'}</h3>
        
        <div className="space-y-3">
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Judul Buku</label>
                <input name="title" defaultValue={data?.title} placeholder="Contoh: Laskar Pelangi" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Penulis</label>
                <input name="author" defaultValue={data?.author} placeholder="Nama Penulis" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Kategori</label>
                    <input name="category" defaultValue={data?.category} placeholder="Umum" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Stok</label>
                    <input name="stock" type="number" defaultValue={data?.stock} placeholder="0" className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Link Cover (Opsional)</label>
                <input name="cover" defaultValue={data?.cover} placeholder="https://..." className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
        </div>

        <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 p-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">Batal</button>
            <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg text-sm font-bold shadow-lg shadow-blue-600/20">Simpan</button>
        </div>
      </form>
    </div>
  );
}
