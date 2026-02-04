CI = false;

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, LogOut, Plus, Search, CheckCircle, XCircle, 
  Clock, Book, ArrowRightLeft, Trash2, Edit, LayoutDashboard, Users 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, 
  doc, onSnapshot, query, serverTimestamp 
} from 'firebase/firestore';

// --- KONFIGURASI FIREBASE (MENGGUNAKAN ENV) ---
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

// ID unik untuk koleksi (Anda bisa mengganti ini dengan string tetap, misal: 'school-library-01')
const APP_DATA_ID = 'edulib-v1';

export default function App() {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);
  const [view, setView] = useState('login');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBook, setCurrentBook] = useState(null); 

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const booksRef = collection(db, 'libraries', APP_DATA_ID, 'books');
    const unsubBooks = onSnapshot(query(booksRef), (snapshot) => {
      setBooks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const transRef = collection(db, 'libraries', APP_DATA_ID, 'transactions');
    const unsubTrans = onSnapshot(query(transRef), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    const studentsRef = collection(db, 'libraries', APP_DATA_ID, 'students');
    const unsubStudents = onSnapshot(query(studentsRef), (snapshot) => {
      setStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubBooks(); unsubTrans(); unsubStudents(); };
  }, [user]);

  const handleLogin = (role, credentials) => {
    if (role === 'admin') {
      if (credentials.username === 'admin' && credentials.password === 'admin123') {
        setAppUser({ role: 'admin', name: 'Administrator', id: 'admin-01' });
        setView('admin-dashboard');
      } else {
        alert("Admin: Username/Password salah!");
      }
    } else {
      const found = students.find(s => s.nisn === credentials.nisn);
      if (found) {
        setAppUser({ role: 'student', name: found.name, nisn: found.nisn });
        setView('student-dashboard');
      } else {
        alert("NISN tidak terdaftar!");
      }
    }
  };

  const handleSaveBook = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const bookData = {
      title: formData.get('title'),
      author: formData.get('author'),
      category: formData.get('category'),
      stock: parseInt(formData.get('stock')),
      cover: formData.get('cover') || 'https://via.placeholder.com/150'
    };

    try {
      if (currentBook) {
        await updateDoc(doc(db, 'libraries', APP_DATA_ID, 'books', currentBook.id), bookData);
      } else {
        await addDoc(collection(db, 'libraries', APP_DATA_ID, 'books'), bookData);
      }
      setIsModalOpen(false);
      setCurrentBook(null);
    } catch (e) { alert("Gagal simpan buku"); }
  };

  const handleDeleteBook = async (id) => {
    if(!window.confirm("Hapus buku?")) return;
    await deleteDoc(doc(db, 'libraries', APP_DATA_ID, 'books', id));
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const nisn = formData.get('nisn');
    const name = formData.get('name');
    if (students.find(s => s.nisn === nisn)) return alert("NISN Duplikat");
    await addDoc(collection(db, 'libraries', APP_DATA_ID, 'students'), { nisn, name, createdAt: serverTimestamp() });
    e.target.reset();
  };

  const handleDeleteStudent = async (id) => {
    if(!window.confirm("Hapus siswa?")) return;
    await deleteDoc(doc(db, 'libraries', APP_DATA_ID, 'students', id));
  };

  const requestBorrow = async (book) => {
    if (book.stock < 1) return alert("Stok habis");
    await addDoc(collection(db, 'libraries', APP_DATA_ID, 'transactions'), {
      bookId: book.id, bookTitle: book.title, studentName: appUser.name, studentNisn: appUser.nisn,
      status: 'pending_borrow', requestDate: new Date().toISOString(), createdAt: serverTimestamp()
    });
    alert("Berhasil diajukan");
  };

  const requestReturn = async (id) => {
    await updateDoc(doc(db, 'libraries', APP_DATA_ID, 'transactions', id), { status: 'pending_return' });
  };

  const handleTransactionAction = async (trans, action) => {
    const tRef = doc(db, 'libraries', APP_DATA_ID, 'transactions', trans.id);
    const bRef = doc(db, 'libraries', APP_DATA_ID, 'books', trans.bookId);
    const book = books.find(b => b.id === trans.bookId);

    if (action === 'approve_borrow') {
      if (!book || book.stock < 1) return alert("Stok kosong");
      await updateDoc(bRef, { stock: book.stock - 1 });
      await updateDoc(tRef, { status: 'borrowed' });
    } else if (action === 'reject_borrow') {
      await updateDoc(tRef, { status: 'rejected' });
    } else if (action === 'confirm_return') {
      if (book) await updateDoc(bRef, { stock: book.stock + 1 });
      await updateDoc(tRef, { status: 'returned' });
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center">Memuat...</div>;
  if (!appUser) return <LoginScreen onLogin={handleLogin} roleType={view === 'login' ? 'student' : 'admin'} setRoleType={(r) => setView(r === 'student' ? 'login' : 'admin_login')} />;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 font-bold text-xl border-b border-slate-800">EduLib</div>
        <nav className="p-4 flex-1 space-y-2">
          {appUser.role === 'admin' ? (
            <>
              <button onClick={() => setView('admin-dashboard')} className={`w-full text-left p-2 rounded ${view === 'admin-dashboard' ? 'bg-blue-600' : ''}`}>Dashboard</button>
              <button onClick={() => setView('admin-books')} className={`w-full text-left p-2 rounded ${view === 'admin-books' ? 'bg-blue-600' : ''}`}>Buku</button>
              <button onClick={() => setView('admin-students')} className={`w-full text-left p-2 rounded ${view === 'admin-students' ? 'bg-blue-600' : ''}`}>Siswa</button>
            </>
          ) : (
            <>
              <button onClick={() => setView('student-dashboard')} className={`w-full text-left p-2 rounded ${view === 'student-dashboard' ? 'bg-blue-600' : ''}`}>Katalog</button>
              <button onClick={() => setView('student-history')} className={`w-full text-left p-2 rounded ${view === 'student-history' ? 'bg-blue-600' : ''}`}>Pinjaman Saya</button>
            </>
          )}
        </nav>
        <button onClick={() => { setAppUser(null); setView('login'); }} className="p-6 text-red-400 text-left border-t border-slate-800">Keluar</button>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        {view === 'admin-dashboard' && <AdminDash transactions={transactions} books={books} onAction={handleTransactionAction} />}
        {view === 'admin-books' && <BookList books={books} onAdd={() => {setCurrentBook(null); setIsModalOpen(true)}} onDelete={handleDeleteBook} onEdit={(b) => {setCurrentBook(b); setIsModalOpen(true)}} />}
        {view === 'admin-students' && <StudentList students={students} onAdd={handleAddStudent} onDelete={handleDeleteStudent} />}
        {view === 'student-dashboard' && <Catalog books={books} transactions={transactions} userNisn={appUser.nisn} onBorrow={requestBorrow} />}
        {view === 'student-history' && <History transactions={transactions.filter(t => t.studentNisn === appUser.nisn)} onReturn={requestReturn} />}
      </main>

      {isModalOpen && <BookModal onClose={() => setIsModalOpen(false)} onSave={handleSaveBook} data={currentBook} />}
    </div>
  );
}

// Sub-components (Simplified versions for brevity)
function LoginScreen({ onLogin, roleType, setRoleType }) {
  const [data, setData] = useState({ username: '', password: '', nisn: '' });
  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">EduLib Login</h2>
        <div className="flex mb-6 bg-gray-100 p-1 rounded">
          <button onClick={() => setRoleType('student')} className={`flex-1 py-1 rounded ${roleType === 'student' ? 'bg-white shadow' : ''}`}>Siswa</button>
          <button onClick={() => setRoleType('admin')} className={`flex-1 py-1 rounded ${roleType === 'admin' ? 'bg-white shadow' : ''}`}>Admin</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(roleType, data); }} className="space-y-4">
          {roleType === 'student' ? 
            <input placeholder="Masukkan NISN" className="w-full border p-2 rounded" required onChange={e => setData({...data, nisn: e.target.value})} /> :
            <>
              <input placeholder="Username" className="w-full border p-2 rounded" required onChange={e => setData({...data, username: e.target.value})} />
              <input type="password" placeholder="Password" className="w-full border p-2 rounded" required onChange={e => setData({...data, password: e.target.value})} />
            </>
          }
          <button className="w-full bg-blue-600 text-white py-2 rounded font-bold">Masuk</button>
        </form>
      </div>
    </div>
  );
}

function AdminDash({ transactions, books, onAction }) {
  const pB = transactions.filter(t => t.status === 'pending_borrow');
  const pR = transactions.filter(t => t.status === 'pending_return');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-bold mb-4">Request Pinjam ({pB.length})</h3>
        {pB.map(t => (
          <div key={t.id} className="flex justify-between border-b py-2 text-sm">
            <span>{t.studentName} - {t.bookTitle}</span>
            <div className="space-x-2">
              <button onClick={() => onAction(t, 'approve_borrow')} className="text-green-600">Terima</button>
              <button onClick={() => onAction(t, 'reject_borrow')} className="text-red-600">Tolak</button>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-bold mb-4">Verifikasi Kembali ({pR.length})</h3>
        {pR.map(t => (
          <div key={t.id} className="flex justify-between border-b py-2 text-sm">
            <span>{t.studentName} - {t.bookTitle}</span>
            <button onClick={() => onAction(t, 'confirm_return')} className="text-blue-600">Konfirmasi</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookList({ books, onAdd, onDelete, onEdit }) {
  return (
    <div className="bg-white rounded shadow">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="font-bold">Data Buku</h3>
        <button onClick={onAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">+ Tambah</button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr><th className="p-3 text-left">Judul</th><th className="p-3">Stok</th><th className="p-3 text-right">Aksi</th></tr></thead>
        <tbody>
          {books.map(b => (
            <tr key={b.id} className="border-t">
              <td className="p-3">{b.title}</td>
              <td className="p-3 text-center">{b.stock}</td>
              <td className="p-3 text-right space-x-2">
                <button onClick={() => onEdit(b)} className="text-blue-600">Edit</button>
                <button onClick={() => onDelete(b.id)} className="text-red-600">Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentList({ students, onAdd, onDelete }) {
  return (
    <div className="space-y-4">
      <form onSubmit={onAdd} className="bg-white p-4 rounded shadow flex gap-2">
        <input name="nisn" placeholder="NISN" className="border p-2 rounded flex-1" required />
        <input name="name" placeholder="Nama Siswa" className="border p-2 rounded flex-1" required />
        <button className="bg-blue-600 text-white px-4 rounded">Daftarkan</button>
      </form>
      <div className="bg-white rounded shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-3 text-left">NISN</th><th className="p-3 text-left">Nama</th><th className="p-3 text-right">Aksi</th></tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-mono">{s.nisn}</td>
                <td className="p-3">{s.name}</td>
                <td className="p-3 text-right"><button onClick={() => onDelete(s.id)} className="text-red-600">Hapus</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Catalog({ books, transactions, userNisn, onBorrow }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {books.map(b => {
        const active = transactions.find(t => t.bookId === b.id && t.studentNisn === userNisn && ['pending_borrow','borrowed','pending_return'].includes(t.status));
        return (
          <div key={b.id} className="bg-white p-4 rounded shadow border flex flex-col">
            <h4 className="font-bold line-clamp-1">{b.title}</h4>
            <p className="text-xs text-gray-500 mb-2">Stok: {b.stock}</p>
            {active ? <span className="text-xs bg-gray-100 p-1 text-center rounded">Aktif</span> :
            <button onClick={() => onBorrow(b)} disabled={b.stock < 1} className="mt-auto bg-blue-600 text-white text-xs py-1 rounded disabled:bg-gray-300">Pinjam</button>}
          </div>
        )
      })}
    </div>
  );
}

function History({ transactions, onReturn }) {
  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr><th className="p-3 text-left">Buku</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead>
        <tbody>
          {transactions.map(t => (
            <tr key={t.id} className="border-t">
              <td className="p-3">{t.bookTitle}</td>
              <td className="p-3"><span className="text-xs">{t.status}</span></td>
              <td className="p-3 text-right">{t.status === 'borrowed' && <button onClick={() => onReturn(t.id)} className="text-blue-600">Kembalikan</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookModal({ onClose, onSave, data }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <form onSubmit={onSave} className="bg-white p-6 rounded-lg w-full max-w-sm space-y-4">
        <h3 className="font-bold">{data ? 'Edit' : 'Tambah'} Buku</h3>
        <input name="title" defaultValue={data?.title} placeholder="Judul" className="w-full border p-2" required />
        <input name="author" defaultValue={data?.author} placeholder="Penulis" className="w-full border p-2" required />
        <input name="stock" type="number" defaultValue={data?.stock} placeholder="Stok" className="w-full border p-2" required />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border p-2 rounded">Batal</button>
          <button type="submit" className="flex-1 bg-blue-600 text-white p-2 rounded">Simpan</button>
        </div>
      </form>
    </div>
  );
}