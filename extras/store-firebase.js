/* =====================================================================
   FirebaseStore — mesma interface do LocalStorageStore do index.html.
   Como usar:
   1. Crie um projeto em console.firebase.google.com (plano gratuito Spark serve).
   2. Ative Firestore Database e Authentication (provedor E-mail/Senha).
   3. Em Authentication, crie SÓ o seu usuário (o admin).
   4. Cole as regras de firestore.rules (aba Regras do Firestore) e troque SEU_UID_AQUI.
   5. Preencha firebaseConfig abaixo com os dados do seu app web.
   6. No index.html, troque  <script>  por  <script type="module">,
      importe este arquivo no topo:   import { FirebaseStore, adminLogin } from "./store-firebase.js";
      e troque a linha  const Store = LocalStorageStore;  por  const Store = FirebaseStore;
   7. Troque o login por PIN do painel por adminLogin(email, senha).
   ===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, writeBatch, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  appId: "COLE_AQUI"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export const adminLogin = (email, senha) => signInWithEmailAndPassword(auth, email, senha);
export const adminLogout = () => signOut(auth);
export const onAdmin = cb => onAuthStateChanged(auth, u => cb(!!u));

const P = collection(db, "produtos");
const R = collection(db, "avaliacoes");
const toMs = v => (v && typeof v.toMillis === "function" ? v.toMillis() : Number(v) || Date.now());

export const FirebaseStore = {
  async listProducts() {
    const s = await getDocs(query(P, orderBy("criadoEm", "desc")));
    return s.docs.map(d => ({ ...d.data(), id: d.id }));
  },
  async getProduct(id) {
    const d = await getDoc(doc(P, id));
    return d.exists() ? { ...d.data(), id: d.id } : null;
  },
  async saveProduct(prod) { const { id, ...rest } = prod; await setDoc(doc(P, id), rest); return prod; },
  async deleteProduct(id) {
    const b = writeBatch(db);
    (await getDocs(query(R, where("produtoId", "==", id)))).forEach(d => b.delete(d.ref));
    b.delete(doc(P, id)); await b.commit();
  },
  async listReviews(produtoId, { incluirOcultas = false } = {}) {
    const c = [];
    if (produtoId) c.push(where("produtoId", "==", produtoId));
    if (!incluirOcultas) c.push(where("status", "==", "publicado"));
    const s = await getDocs(query(R, ...c));
    return s.docs.map(d => ({ ...d.data(), id: d.id, criadoEm: toMs(d.data().criadoEm) })).sort((a, b) => b.criadoEm - a.criadoEm);
  },
  async addReview(rv) {
    // Visitantes só conseguem criar com estes campos (as regras validam tudo de novo no servidor)
    const { id, ...rest } = rv;
    const ref = await addDoc(R, { ...rest, util: 0, criadoEm: serverTimestamp() });
    return { ...rv, id: ref.id };
  },
  async updateReview(id, patch) {
    // Visitante: só pode somar +1 em "util". Admin: pode mudar status.
    if (Object.keys(patch).length === 1 && "util" in patch) await updateDoc(doc(R, id), { util: increment(1) });
    else await updateDoc(doc(R, id), patch);
  },
  async deleteReview(id) { await deleteDoc(doc(R, id)); },
  async getSettings() { const d = await getDoc(doc(db, "config", "site")); return d.exists() ? d.data() : { moderarAntes: false }; },
  async saveSettings(s) { await setDoc(doc(db, "config", "site"), { moderarAntes: !!s.moderarAntes }); },
  async exportAll() {
    return { versao: 1, exportadoEm: new Date().toISOString(), produtos: await this.listProducts(), avaliacoes: await this.listReviews(null, { incluirOcultas: true }), config: await this.getSettings() };
  },
  async importAll(data) {
    if (!data || !Array.isArray(data.produtos)) throw new Error('JSON sem a lista "produtos".');
    const b = writeBatch(db);
    data.produtos.forEach(p => { const { id, ...rest } = p; b.set(doc(P, id), rest); });
    await b.commit();
  },
  async resetDemo() { throw new Error("Indisponível no Firebase."); }
};
