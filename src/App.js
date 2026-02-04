CI = false;

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, LogOut, Plus, Search, CheckCircle, XCircle, 
  Clock, Book, ArrowRightLeft, Trash2, Edit, LayoutDashboard, Users,
  KeyRound, ShieldCheck, RefreshCw
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, 
  doc, onSnapshot, query, serverTimestamp 
} from 'firebase/firestore';

// Menonaktifkan peringatan ESLint
/* eslint-disable no-unused-vars */

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const APP_DATA_ID = 'edulib-v1';

export default function App() {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);
  const [view, setView] = useState('login');
  
  // Modal States
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentBook, setCurrentBook] = useState(null); 

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  useEffect(() => {
    if (!user) return;
    const booksRef = collection(db, 'libraries', APP_DATA_ID, 'books');
    const unsubBooks = onSnapshot(query(booksRef), (s) => setBooks(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    const transRef = collection(db, 'libraries', APP_DATA_ID, 'transactions');
    const unsubTrans = onSnapshot(query(transRef), (s) => setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))));

    const studentsRef = collection(db, 'libraries', APP_DATA_ID, 'students');
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
      // Update password siswa di database
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

  // --- RENDER ---

  if (authLoading) return <div className="flex h-screen items-center justify-center font-sans">Memuat...</div>;

  if (!appUser) return (
    <LoginScreen 
      onLogin={handleLogin} 
      roleType={view === 'login' ? 'student' : 'admin'} 
      setRoleType={(r) => setView(r === 'student' ? 'login' : 'admin_login')} 
    />
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <BookOpen className="text-blue-400" />
          <span className="font-bold text-xl tracking-tight">EduLib</span>
        </div>
        <nav className="p-4 flex-1 space-y-1">
          {appUser.role === 'admin' ? (
            <>
              <NavItem active={view === 'admin-dashboard'} onClick={() => setView('admin-dashboard')} icon={<LayoutDashboard size={20}/>} label="Dashboard" />
              <NavItem active={view === 'admin-books'} onClick={() => setView('admin-books')} icon={<Book size={20}/>} label="Buku" />
              <NavItem active={view === 'admin-students'} onClick={() => setView('admin-students')} icon={<Users size={20}/>} label="Siswa & Password" />
            </>
          ) : (
            <>
              <NavItem active={view === 'student-dashboard'} onClick={() => setView('student-dashboard')} icon={<Search size={20}/>} label="Katalog" />
              <NavItem active={view === 'student-history'} onClick={() => setView('student-history')} icon={<Clock size={20}/>} label="Pinjaman Saya" />
            </>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="px-2">
            <div className="text-xs text-slate-500 uppercase font-semibold">Login sebagai</div>
            <div className="text-sm font-medium truncate">{appUser.name}</div>
          </div>
          
          {/* Tombol Ganti Password untuk Siswa */}
          {appUser.role === 'student' && (
            <button 
              onClick={() => setIsPasswordModalOpen(true)}
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

      <main className="flex-1 overflow-auto p-8">
        {view === 'admin-dashboard' && <AdminDash transactions={transactions} onAction={handleTransactionAction} />}
        {view === 'admin-books' && <BookList books={books} onAdd={() => {setCurrentBook(null); setIsBookModalOpen(true)}} onDelete={handleDeleteBook} onEdit={(b) => {setCurrentBook(b); setIsBookModalOpen(true)}} />}
        {view === 'admin-students' && <StudentManagement students={students} db={db} appId={APP_DATA_ID} />}
        {view === 'student-dashboard' && <Catalog books={books} transactions={transactions} userNisn={appUser.nisn} onBorrow={requestBorrow} />}
        {view === 'student-history' && <History transactions={transactions.filter(t => t.studentNisn === appUser.nisn)} onReturn={requestReturn} />}
      </main>

      {/* Modal Buku */}
      {isBookModalOpen && <BookModal onClose={() => setIsBookModalOpen(false)} onSave={handleSaveBook} data={currentBook} />}

      {/* Modal Ganti Password Siswa (Self Service) */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleChangePassword} className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Ganti Password Anda</h3>
            <div className="space-y-3">
              <input type="password" name="newPassword" placeholder="Password Baru" className="w-full border p-2 rounded-lg" required />
              <input type="password" name="confirmPassword" placeholder="Konfirmasi Password Baru" className="w-full border p-2 rounded-lg" required />
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="flex-1 border p-2 rounded-lg">Batal</button>
              <button type="submit" className="flex-1 bg-blue-600 text-white p-2 rounded-lg">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// --- SUB COMPONENTS ---

function NavItem({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
      {icon} <span className="font-medium">{label}</span>
    </button>
  );
}

function LoginScreen({ onLogin, roleType, setRoleType }) {
  const [data, setData] = useState({ username: '', password: '', nisn: '' });
  return (
    <div className="h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="flex justify-center mb-6"><div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg"><BookOpen size={32} /></div></div>
        <h2 className="text-2xl font-bold mb-2 text-center text-slate-800">EduLib Login</h2>
        <div className="flex mb-6 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setRoleType('student')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${roleType === 'student' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Siswa</button>
          <button onClick={() => setRoleType('admin')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${roleType === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Admin</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(roleType, data); }} className="space-y-4">
          {roleType === 'student' ? (
            <>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">NISN</label><input type="text" placeholder="NISN" className="w-full border p-3 rounded-xl mt-1" required onChange={e => setData({...data, nisn: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label><input type="password" placeholder="Password Siswa" className="w-full border p-3 rounded-xl mt-1" required onChange={e => setData({...data, password: e.target.value})} /></div>
            </>
          ) : (
            <>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Username</label><input placeholder="Username" className="w-full border p-3 rounded-xl mt-1" required onChange={e => setData({...data, username: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label><input type="password" placeholder="Password" className="w-full border p-3 rounded-xl mt-1" required onChange={e => setData({...data, password: e.target.value})} /></div>
            </>
          )}
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg mt-4">Masuk</button>
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

  // Reset Password oleh Admin
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
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Manajemen Siswa</h1>
        <p className="text-slate-500 text-sm">Kelola akses login siswa (NISN & Password).</p>
      </header>

      <form onSubmit={addStudent} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">NISN</label>
          <input name="nisn" placeholder="12345" className="w-full border p-2 rounded-lg text-sm" required />
        </div>
        <div className="flex-[2] min-w-[200px]">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nama Lengkap</label>
          <input name="name" placeholder="Nama Siswa" className="w-full border p-2 rounded-lg text-sm" required />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Password Awal</label>
          <input name="password" type="text" placeholder="Min. 4 char" className="w-full border p-2 rounded-lg text-sm" required />
        </div>
        <button className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold h-[38px]">Tambah</button>
      </form>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
            <tr><th className="px-6 py-4">NISN</th><th className="px-6 py-4">Nama</th><th className="px-6 py-4">Password</th><th className="px-6 py-4 text-right">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {students.map(s => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 font-mono text-blue-600">{s.nisn}</td>
                <td className="px-6 py-4 font-semibold">{s.name}</td>
                <td className="px-6 py-4 font-mono text-slate-400">••••••</td>
                <td className="px-6 py-4 text-right flex justify-end gap-3">
                  <button onClick={() => resetPassword(s.id, s.name)} className="text-blue-600 text-xs font-bold flex items-center gap-1 hover:underline">
                    <RefreshCw size={14}/> Reset Pass
                  </button>
                  <button onClick={() => delStudent(s.id)} className="text-red-600 text-xs font-bold flex items-center gap-1 hover:underline">
                    <Trash2 size={14}/> Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Komponen Admin Dashboard, BookList, Catalog, History, BookModal tetap sama (hanya styling yang mengikuti tema)
function AdminDash({ transactions, onAction }) {
  const pB = transactions.filter(t => t.status === 'pending_borrow');
  const pR = transactions.filter(t => t.status === 'pending_return');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-bold mb-4 flex gap-2"><ArrowRightLeft size={20} className="text-orange-500"/> Peminjaman ({pB.length})</h3>
        <div className="space-y-3">{pB.map(t=>(<div key={t.id} className="flex justify-between p-3 bg-slate-50 rounded-xl border"><div><div className="font-bold text-sm">{t.bookTitle}</div><div className="text-xs">{t.studentName}</div></div><div className="flex gap-2"><button onClick={()=>onAction(t,'approve_borrow')} className="p-1.5 bg-green-100 text-green-600 rounded"><CheckCircle size={16}/></button><button onClick={()=>onAction(t,'reject_borrow')} className="p-1.5 bg-red-100 text-red-600 rounded"><XCircle size={16}/></button></div></div>))}</div>
      </div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-bold mb-4 flex gap-2"><CheckCircle size={20} className="text-blue-500"/> Pengembalian ({pR.length})</h3>
        <div className="space-y-3">{pR.map(t=>(<div key={t.id} className="flex justify-between p-3 bg-slate-50 rounded-xl border"><div><div className="font-bold text-sm">{t.bookTitle}</div><div className="text-xs">{t.studentName}</div></div><button onClick={()=>onAction(t,'confirm_return')} className="px-3 bg-blue-600 text-white rounded text-xs">Terima</button></div>))}</div>
      </div>
    </div>
  );
}

function BookList({ books, onAdd, onDelete, onEdit }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">Daftar Buku</h3><button onClick={onAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex gap-2"><Plus size={16}/> Tambah</button></div>
      <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="p-4">Buku</th><th className="p-4 text-center">Stok</th><th className="p-4 text-right">Aksi</th></tr></thead><tbody>{books.map(b=>(<tr key={b.id} className="border-t"><td className="p-4 font-bold">{b.title}</td><td className="p-4 text-center">{b.stock}</td><td className="p-4 text-right flex justify-end gap-2"><button onClick={()=>onEdit(b)} className="text-blue-600"><Edit size={16}/></button><button onClick={()=>onDelete(b.id)} className="text-red-600"><Trash2 size={16}/></button></td></tr>))}</tbody></table>
    </div>
  );
}

function Catalog({ books, transactions, userNisn, onBorrow }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {books.map(b=>{
        const active = transactions.find(t=>t.bookId===b.id && t.studentNisn===userNisn && ['pending_borrow','borrowed','pending_return'].includes(t.status));
        return (
        <div key={b.id} className="bg-white p-4 rounded-xl shadow-sm border flex flex-col">
          <div className="aspect-[3/4] bg-slate-200 rounded-lg mb-3 overflow-hidden"><img src={b.cover} className="w-full h-full object-cover"/></div>
          <h4 className="font-bold text-sm line-clamp-1">{b.title}</h4>
          <p className="text-xs text-slate-500 mb-2">{b.author}</p>
          <div className="mt-auto flex justify-between items-center"><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">Stok: {b.stock}</span>{active?<span className="text-[10px] text-blue-600 font-bold">Aktif</span>:<button onClick={()=>onBorrow(b)} disabled={b.stock<1} className="text-xs bg-blue-600 text-white px-2 py-1 rounded disabled:bg-slate-300">Pinjam</button>}</div>
        </div>
      )})}
    </div>
  );
}

function History({ transactions, onReturn }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm"><table className="w-full text-sm text-left"><thead className="bg-slate-50 uppercase text-[10px]"><tr><th className="p-4">Buku</th><th className="p-4">Status</th><th className="p-4 text-right">Aksi</th></tr></thead><tbody>{transactions.map(t=>(<tr key={t.id} className="border-t"><td className="p-4 font-bold">{t.bookTitle}</td><td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{t.status}</span></td><td className="p-4 text-right">{t.status==='borrowed'&&<button onClick={()=>onReturn(t.id)} className="text-blue-600 text-xs font-bold">Kembalikan</button>}</td></tr>))}</tbody></table></div>
  );
}

function BookModal({ onClose, onSave, data }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <form onSubmit={onSave} className="bg-white p-6 rounded-xl w-full max-w-sm space-y-3">
        <h3 className="font-bold text-lg">{data?'Edit':'Tambah'} Buku</h3>
        <input name="title" defaultValue={data?.title} placeholder="Judul" className="w-full border p-2 rounded" required />
        <input name="author" defaultValue={data?.author} placeholder="Penulis" className="w-full border p-2 rounded" required />
        <input name="stock" type="number" defaultValue={data?.stock} placeholder="Stok" className="w-full border p-2 rounded" required />
        <input name="cover" defaultValue={data?.cover} placeholder="URL Cover" className="w-full border p-2 rounded" />
        <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 border p-2 rounded">Batal</button><button className="flex-1 bg-blue-600 text-white p-2 rounded">Simpan</button></div>
      </form>
    </div>
  );
}