import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Compass,
  HeartHandshake,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

type Account = { name: string; phone: string };
type Device = {
  id: number;
  name: string;
  owner_name: string;
  is_mine: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  last_seen: string | null;
  is_lost: boolean;
};
type Invitation = { id: number; owner_name?: string; phone?: string; state?: string };
type AuthMode = "login" | "register";

const configuredDb = import.meta.env.VITE_ODOO_DB || "";
const savedDb = localStorage.getItem("fmdb_database") || "";
const initialDb = configuredDb && !configuredDb.includes("your_local")
  ? configuredDb
  : savedDb;

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("সার্ভার থেকে সঠিক উত্তর আসেনি। Odoo চালু আছে কি না দেখুন।");
  }
}

async function api<T>(
  database: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const query = database ? `?db=${encodeURIComponent(database)}` : "";
  const response = await fetch(`/api/fmdb/${path}${query}`, {
    method: body ? "POST" : "GET",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await readJson<T & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(result.error || `অনুরোধটি সম্পন্ন হয়নি (${response.status})।`);
  }
  return result;
}

async function rpc<T>(
  database: string,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const query = database ? `?db=${encodeURIComponent(database)}` : "";
  const response = await fetch(`/web/session/${method}${query}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { ...params, db: database },
      id: Date.now(),
    }),
  });
  const payload = await readJson<{
    result?: T & { uid?: number | false };
    error?: { data?: { message?: string }; message?: string };
  }>(response);
  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.data?.message || payload.error?.message || "Odoo-তে সংযোগ করা যায়নি।",
    );
  }
  return payload.result as T;
}

function getBrowserKey(): string {
  const key = localStorage.getItem("fmdb_browser_key");
  if (key) return key;
  const newKey = crypto.randomUUID();
  localStorage.setItem("fmdb_browser_key", newKey);
  return newKey;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("8801")) return `+${digits}`;
  if (digits.startsWith("01")) return `+880${digits.slice(1)}`;
  return value.trim();
}

function formatTime(value: string | null): string {
  if (!value) return "এখনো কোনো অবস্থান আসেনি";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
}

function isFresh(value: string | null): boolean {
  if (!value) return false;
  return Date.now() - new Date(`${value.replace(" ", "T")}Z`).getTime() < 120_000;
}

function App() {
  const [database, setDatabase] = useState(initialDb);
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [incoming, setIncoming] = useState<Invitation[]>([]);
  const [acceptedIncoming, setAcceptedIncoming] = useState<Invitation[]>([]);
  const [outgoing, setOutgoing] = useState<Invitation[]>([]);
  const [deviceName, setDeviceName] = useState("আমার ডিভাইস");
  const [invitePhone, setInvitePhone] = useState("");
  const [tracking, setTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const watchId = useRef<number | null>(null);
  const currentDeviceId = useRef<number | null>(null);

  const loadDashboard = useCallback(async () => {
    const [deviceData, invitationData] = await Promise.all([
      api<{ devices: Device[] }>(database, "devices"),
      api<{ incoming: Invitation[]; accepted_incoming: Invitation[]; outgoing: Invitation[] }>(database, "invitations"),
    ]);
    setDevices(deviceData.devices);
    setIncoming(invitationData.incoming);
    setAcceptedIncoming(invitationData.accepted_incoming);
    setOutgoing(invitationData.outgoing);
  }, [database]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "তথ্য লোড করা যায়নি।");
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  useEffect(() => {
    if (!database) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api<{ authenticated: boolean }>(database, "session")
      .then(async (session) => {
        if (cancelled || !session.authenticated) return;
        const current = await api<Account>(database, "me");
        if (!cancelled) setAccount(current);
      })
      .catch(() => {
        if (!cancelled) {
          setAccount(null);
          setError("Odoo-তে সংযোগ হচ্ছে না। Docker/Odoo চালু করে আবার চেষ্টা করুন।");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [database]);

  useEffect(() => {
    if (!account) return;
    void refresh();
    const timer = window.setInterval(() => {
      void loadDashboard().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "তথ্য আপডেট করা যায়নি।");
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [account, loadDashboard, refresh]);

  useEffect(
    () => () => {
      if (watchId.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    },
    [],
  );

  async function authenticate(phone: string, password: string) {
    await rpc(database, "authenticate", { login: phone, password });
    const current = await api<Account>(database, "me");
    setAccount(current);
    setError("");
    setMessage(`স্বাগতম, ${current.name}`);
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");
    try {
      if (!database.trim()) {
        throw new Error("আপনার Odoo database-এর নাম লিখুন।");
      }
      localStorage.setItem("fmdb_database", database.trim());
      if (mode === "register") {
        const name = String(form.get("name") || "").trim();
        const result = await api<{ phone: string }>(database, "register", {
          name,
          phone,
          password,
        });
        await authenticate(result.phone, password);
      } else {
        await authenticate(normalizePhone(phone), password);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "প্রবেশ করা যায়নি।");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    stopSharing();
    try {
      await rpc(database, "destroy", {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "লগআউট সম্পন্ন করা যায়নি।");
    } finally {
      setAccount(null);
      setDevices([]);
      setIncoming([]);
      setOutgoing([]);
      setTracking(false);
    }
  }

  async function startSharing() {
    setError("");
    setMessage("");
    try {
      if (!navigator.geolocation) {
        throw new Error("এই ব্রাউজারে location সুবিধা নেই।");
      }
      const registered = await api<{ device: Device }>(database, "devices/register", {
        browser_key: getBrowserKey(),
        name: deviceName.trim() || "আমার ডিভাইস",
      });
      currentDeviceId.current = registered.device.id;
      setTracking(true);
      const lastSentAt = { value: 0 };
      watchId.current = navigator.geolocation.watchPosition(
        async (position) => {
          if (Date.now() - lastSentAt.value < 15_000) return;
          lastSentAt.value = Date.now();
          try {
            const result = await api<{ device: Device }>(database, "devices/location", {
              device_id: registered.device.id,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
            setDevices((current) => [
              result.device,
              ...current.filter((device) => device.id !== result.device.id),
            ]);
            setMessage("এই ডিভাইসের অবস্থান নিরাপদে আপডেট হয়েছে।");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "অবস্থান আপডেট করা যায়নি।");
            if (watchId.current !== null) {
              navigator.geolocation.clearWatch(watchId.current);
              watchId.current = null;
            }
            setTracking(false);
          }
        },
        (positionError) => {
        if (watchId.current !== null) {
          navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        }
        setTracking(false);
          setError(
            positionError.code === positionError.PERMISSION_DENIED
              ? "অবস্থান শেয়ার করতে ব্রাউজারের location permission অনুমোদন করুন।"
              : "অবস্থান পাওয়া যায়নি। Location চালু করে আবার চেষ্টা করুন।",
          );
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );
    } catch (cause) {
      setTracking(false);
      setError(cause instanceof Error ? cause.message : "অবস্থান শেয়ার চালু করা যায়নি।");
    }
  }

  function stopSharing() {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    currentDeviceId.current = null;
    setTracking(false);
    setMessage("এই ব্রাউজার থেকে নতুন অবস্থান পাঠানো বন্ধ হয়েছে।");
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api(database, "invitations/create", { phone: invitePhone.trim() });
      setInvitePhone("");
      setMessage("আমন্ত্রণ পাঠানো হয়েছে। প্রাপক গ্রহণ করলে তবেই অবস্থান দেখা যাবে।");
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "আমন্ত্রণ পাঠানো যায়নি।");
    }
  }

  async function invitationAction(id: number, action: string) {
    setError("");
    setMessage("");
    try {
      await api(database, "invitations/action", { id, action });
      await loadDashboard();
      setMessage(
        action === "accept"
          ? "আমন্ত্রণ গ্রহণ হয়েছে। আপনার ডিভাইসের অবস্থান আমন্ত্রণদাতার সঙ্গে শেয়ার হবে।"
          : "শেয়ার/আমন্ত্রণের পরিবর্তন সংরক্ষিত হয়েছে।",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "পরিবর্তনটি সংরক্ষণ করা যায়নি।");
    }
  }

  async function toggleLost(device: Device) {
    setError("");
    try {
      await api(database, "devices/lost", {
        device_id: device.id,
        is_lost: !device.is_lost,
      });
      await loadDashboard();
      setMessage(device.is_lost ? "হারানো চিহ্ন সরানো হয়েছে।" : "ডিভাইসটি হারানো হিসেবে চিহ্নিত হয়েছে।");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "পরিবর্তন করা যায়নি।");
    }
  }

  const ownCount = devices.filter((device) => device.is_mine).length;
  const sharedCount = devices.length - ownCount;

  if (loading) {
    return (
      <main className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <span>FindMyDeviceBD চালু হচ্ছে…</span>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="auth-layout">
        <section className="auth-intro">
          <a className="brand" href="/" aria-label="FindMyDeviceBD হোম">
            <span className="brand-mark"><Compass size={22} /></span>
            <span>FindMyDevice<span className="brand-bd">BD</span></span>
          </a>
          <div className="intro-copy">
            <span className="eyebrow"><ShieldCheck size={15} /> নিজের ডিভাইস, নিজের নিয়ন্ত্রণে</span>
            <h1>আপনার প্রিয়<br />ডিভাইসগুলো <em>কাছেই</em> রাখুন।</h1>
            <p>সম্মতি নিয়ে অবস্থান শেয়ার করুন। নিজের ডিভাইস খুঁজুন, পরিবারের সঙ্গে নিরাপদে যুক্ত থাকুন।</p>
            <div className="intro-points">
              <span><MapPin size={17} /> শুধু অনুমতি দিলে অবস্থান শেয়ার</span>
              <span><HeartHandshake size={17} /> আমন্ত্রণ গ্রহণ করলেই সংযোগ</span>
              <span><LockKeyhole size={17} /> যে কোনো সময় শেয়ার বন্ধ করুন</span>
            </div>
          </div>
          <p className="intro-foot">আপনার নিরাপত্তা ও গোপনীয়তা আগে।</p>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <div className="mobile-brand brand">
              <span className="brand-mark"><Compass size={22} /></span>
              <span>FindMyDevice<span className="brand-bd">BD</span></span>
            </div>
            <div className="auth-heading">
              <span className="eyebrow">{mode === "login" ? "আবার স্বাগতম" : "নিরাপদে শুরু করুন"}</span>
              <h2>{mode === "login" ? "আপনার অ্যাকাউন্টে প্রবেশ করুন" : "আপনার অ্যাকাউন্ট তৈরি করুন"}</h2>
              <p>{mode === "login" ? "আপনার ডিভাইসগুলো দেখতে লগইন করুন।" : "একটি মোবাইল নম্বর দিয়ে একটি অ্যাকাউন্ট।"}</p>
            </div>
            {error && <div className="notice notice-error"><CircleAlert size={17} />{error}</div>}
            {message && <div className="notice notice-success"><Check size={17} />{message}</div>}
            <form className="auth-form" onSubmit={handleAuth}>
              {mode === "register" && (
                <label>
                  আপনার নাম
                  <span className="input-wrap"><UserRound size={17} /><input name="name" autoComplete="name" required maxLength={120} placeholder="যেমন: সাকিব আহমেদ" /></span>
                </label>
              )}
              <label>
                মোবাইল নম্বর
                <span className="input-wrap"><Smartphone size={17} /><input name="phone" type="tel" autoComplete="tel" required placeholder="01XXXXXXXXX" /></span>
              </label>
              <label>
                পাসওয়ার্ড
                <span className="input-wrap"><LockKeyhole size={17} /><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : undefined} placeholder={mode === "register" ? "কমপক্ষে ১০ অক্ষর" : "আপনার পাসওয়ার্ড"} /></span>
              </label>
              <label>
                Odoo database
                <span className="input-wrap"><Compass size={17} /><input value={database} onChange={(event) => setDatabase(event.target.value)} required placeholder="যেমন: havenverse" /></span>
                <small>Odoo admin password নয়—আপনার স্থানীয় database-এর নাম দিন।</small>
              </label>
              <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={18} /> : null}
                {submitting ? "অপেক্ষা করুন…" : mode === "login" ? "নিরাপদে লগইন করুন" : "অ্যাকাউন্ট খুলুন"}
                {!submitting && <ChevronRight size={18} />}
              </button>
            </form>
            <p className="auth-switch">
              {mode === "login" ? "নতুন এখানে?" : "আগে থেকেই অ্যাকাউন্ট আছে?"}{" "}
              <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
                {mode === "login" ? "অ্যাকাউন্ট খুলুন" : "লগইন করুন"}
              </button>
            </p>
            {mode === "register" && <p className="auth-legal">নিবন্ধন করে নিশ্চিত করছেন—অবস্থান শুধু নিজের বা স্পষ্ট সম্মতিপ্রাপ্ত ডিভাইসে শেয়ার করবেন। ফোন নম্বর SMS দিয়ে যাচাই করা হয় না।</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="FindMyDeviceBD হোম">
          <span className="brand-mark"><Compass size={22} /></span>
          <span>FindMyDevice<span className="brand-bd">BD</span></span>
        </a>
        <div className="sidebar-caption">আপনার স্পেস</div>
        <div className="side-link active"><MapPin size={18} /> ডিভাইস মানচিত্র</div>
        <div className="side-link"><UsersRound size={18} /> বিশ্বস্ত মানুষ <span className="side-count">{sharedCount}</span></div>
        <div className="sidebar-bottom">
          <div className="privacy-mini"><ShieldCheck size={18} /><span><strong>আপনি নিয়ন্ত্রণে</strong><br />লোকেশন শেয়ার বন্ধ করা যাবে যে কোনো সময়।</span></div>
          <div className="profile">
            <span className="avatar">{account.name.slice(0, 1)}</span>
            <span className="profile-name"><strong>{account.name}</strong><small>{account.phone}</small></span>
            <button className="icon-button logout-button" onClick={() => void logout()} aria-label="লগআউট"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">আমার অ্যাকাউন্ট <ChevronRight size={15} /> <strong>ড্যাশবোর্ড</strong></div>
          <div className="top-actions">
            <button className="button button-light" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? "spin" : ""} /> আপডেট
            </button>
            <button className="icon-button mobile-logout" onClick={() => void logout()} aria-label="লগআউট"><LogOut size={18} /></button>
          </div>
        </header>
        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">আপনার নিরাপদ জায়গা</div>
              <h1>আসসালামু আলাইকুম, {account.name.split(" ")[0]} <span className="wave">👋</span></h1>
              <p>আপনার ও প্রিয়জনদের সম্মতিতে শেয়ার করা ডিভাইসের সর্বশেষ অবস্থান এক জায়গায়।</p>
            </div>
            <div className="date-chip"><Clock3 size={16} /> লোকেশন পেলে আপডেট হবে</div>
          </div>

          {error && <div className="notice notice-error page-notice"><CircleAlert size={17} />{error}<button className="notice-close" onClick={() => setError("")} aria-label="বন্ধ করুন"><X size={16} /></button></div>}
          {message && <div className="notice notice-success page-notice"><Check size={17} />{message}<button className="notice-close" onClick={() => setMessage("")} aria-label="বন্ধ করুন"><X size={16} /></button></div>}

          <section className="summary-grid" aria-label="ডিভাইস সারাংশ">
            <article className="summary-card"><span className="summary-icon green"><Smartphone size={19} /></span><span className="summary-label">আমার ডিভাইস</span><strong>{ownCount.toLocaleString("bn-BD")}</strong><small>এই অ্যাকাউন্টে নিবন্ধিত</small></article>
            <article className="summary-card"><span className="summary-icon lilac"><UsersRound size={19} /></span><span className="summary-label">শেয়ার করা</span><strong>{sharedCount.toLocaleString("bn-BD")}</strong><small>অনুমতি পাওয়া ডিভাইস</small></article>
            <article className="summary-card"><span className="summary-icon amber"><Radio size={19} /></span><span className="summary-label">সাম্প্রতিক অবস্থান</span><strong>{devices.filter((device) => isFresh(device.last_seen)).length.toLocaleString("bn-BD")}</strong><small>গত ২ মিনিটে আপডেট</small></article>
          </section>

          <section className="share-banner">
            <div className="banner-icon"><MapPin size={23} /></div>
            <div className="banner-copy"><strong>এই ডিভাইসের অবস্থান শেয়ার করুন</strong><span>শুধু আপনি চালু করলে এবং browser permission দিলে অবস্থান আপডেট হবে।</span></div>
            <div className="share-controls">
              <input aria-label="ডিভাইসের নাম" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} disabled={tracking} />
              {tracking ? (
                <button className="button button-stop" onClick={stopSharing}><span className="live-dot" /> বন্ধ করুন</button>
              ) : (
                <button className="button button-dark" onClick={() => void startSharing()}><Radio size={16} /> অবস্থান চালু করুন</button>
              )}
            </div>
          </section>

          <div className="section-heading">
            <div><h2>আপনার ডিভাইস</h2><p>অবস্থানের পাশে শেষ আপডেটের সময় দেখুন।</p></div>
            <span className="total-pill">{devices.length.toLocaleString("bn-BD")} ডিভাইস</span>
          </div>
          {devices.length === 0 ? (
            <section className="empty-state">
              <div className="empty-icon"><MapPin size={25} /></div>
              <h3>এখনো কোনো ডিভাইস নেই</h3>
              <p>এই ডিভাইসে অবস্থান শেয়ার চালু করুন, অথবা কাউকে আমন্ত্রণ পাঠিয়ে তার সম্মতি নিন।</p>
            </section>
          ) : (
            <section className="device-grid">
              {devices.map((device) => {
                const hasLocation = device.latitude !== null && device.longitude !== null;
                const mapLink = hasLocation
                  ? `https://www.openstreetmap.org/?mlat=${device.latitude}&mlon=${device.longitude}#map=17/${device.latitude}/${device.longitude}`
                  : undefined;
                return (
                  <article className={`device-card${device.is_lost ? " device-lost" : ""}`} key={device.id}>
                    <div className="device-card-top">
                      <span className={`device-icon ${device.is_mine ? "green" : "lilac"}`}>
                        {device.name.toLowerCase().includes("laptop") || device.name.toLowerCase().includes("ল্যাপটপ") ? <Laptop size={19} /> : <Smartphone size={19} />}
                      </span>
                      <span className={`status-pill ${isFresh(device.last_seen) ? "status-live" : "status-old"}`}>
                        <span className="status-dot" />{isFresh(device.last_seen) ? "সাম্প্রতিক" : "পুরোনো"}
                      </span>
                    </div>
                    <h3>{device.name}</h3>
                    <p className="device-owner">{device.is_mine ? "আপনার ডিভাইস" : `${device.owner_name} শেয়ার করেছেন`}</p>
                    {device.is_lost && <span className="lost-label"><CircleAlert size={14} /> হারানো হিসেবে চিহ্নিত</span>}
                    <div className="location-info">
                      <MapPin size={15} />
                      {hasLocation ? (
                        <span>{device.latitude!.toFixed(5)}, {device.longitude!.toFixed(5)}</span>
                      ) : <span>অবস্থান এখনো পাওয়া যায়নি</span>}
                    </div>
                    <div className="device-footer">
                      <span>{formatTime(device.last_seen)}</span>
                      {device.is_mine && (
                        <button className="text-button" onClick={() => void toggleLost(device)}>
                          {device.is_lost ? "চিহ্ন সরান" : "হারানো চিহ্নিত"}
                        </button>
                      )}
                    </div>
                    {mapLink && <a className="map-link" href={mapLink} target="_blank" rel="noreferrer"><MapPin size={15} /> মানচিত্রে দেখুন <ArrowUpRight size={14} /></a>}
                  </article>
                );
              })}
            </section>
          )}

          <section className="sharing-section">
            <div className="section-heading">
              <div><h2>বিশ্বস্ত মানুষ</h2><p>তাঁদের অনুমতি নিয়ে অবস্থান শেয়ার করুন।</p></div>
            </div>
            <div className="sharing-grid">
              <div className="sharing-card">
                <span className="sharing-card-icon"><UserRound size={18} /></span>
                <h3>নতুন আমন্ত্রণ</h3>
                <p>বাংলাদেশি নম্বর দিন। প্রাপক অ্যাকাউন্ট খুলে আমন্ত্রণ গ্রহণ করলে তাঁর ডிவাইসের অবস্থান আপনার সঙ্গে শেয়ার হবে।</p>
                <form className="invite-form" onSubmit={(event) => void invite(event)}>
                  <input type="tel" value={invitePhone} onChange={(event) => setInvitePhone(event.target.value)} placeholder="01XXXXXXXXX" aria-label="আমন্ত্রণের মোবাইল নম্বর" required />
                  <button className="button button-dark" type="submit"><Plus size={16} /> আমন্ত্রণ</button>
                </form>
              </div>
              <div className="sharing-card invitation-card">
                <span className="sharing-card-icon"><ArrowDownLeft size={18} /></span>
                <h3>আপনার আমন্ত্রণ</h3>
                {incoming.length === 0 ? <p className="muted-copy">নতুন আমন্ত্রণ এলে এখানে দেখতে পাবেন।</p> : incoming.map((item) => (
                  <div className="invitation-row" key={item.id}>
                    <span><strong>{item.owner_name}</strong><small>আপনার ডিভাইসের অবস্থান দেখতে আমন্ত্রণ পাঠিয়েছেন</small></span>
                    <button className="button button-accept" onClick={() => void invitationAction(item.id, "accept")} aria-label="আমন্ত্রণ গ্রহণ"><Check size={16} /></button>
                    <button className="button button-light button-square" onClick={() => void invitationAction(item.id, "reject")} aria-label="আমন্ত্রণ প্রত্যাখ্যান"><X size={16} /></button>
                  </div>
                ))}
              </div>
              {acceptedIncoming.length > 0 && (
                <div className="sharing-card">
                  <span className="sharing-card-icon"><HeartHandshake size={18} /></span>
                  <h3>আপনি যাঁদের সঙ্গে শেয়ার করছেন</h3>
                  {acceptedIncoming.map((item) => (
                    <div className="outgoing-row" key={item.id}>
                      <span><strong>{item.owner_name}</strong><small>আপনার ডিভাইসের অবস্থান দেখতে পারেন</small></span>
                      <button className="text-button" onClick={() => void invitationAction(item.id, "leave")}>শেয়ার বন্ধ</button>
                    </div>
                  ))}
                </div>
              )}
              {outgoing.length > 0 && (
                <div className="sharing-card outgoing-card">
                  <span className="sharing-card-icon"><ArrowUpRight size={18} /></span>
                  <h3>পাঠানো আমন্ত্রণ</h3>
                  {outgoing.map((item) => (
                    <div className="outgoing-row" key={item.id}>
                      <span><strong>{item.phone}</strong><small>{item.state === "accepted" ? "অবস্থান শেয়ার চালু" : item.state === "pending" ? "গ্রহণের অপেক্ষায়" : item.state === "revoked" ? "শেয়ার বন্ধ" : "আমন্ত্রণ প্রত্যাখ্যাত"}</small></span>
                      {item.state === "pending" || item.state === "accepted" ? <button className="text-button" onClick={() => void invitationAction(item.id, "revoke")}>বন্ধ করুন</button> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sharing-note"><LockKeyhole size={15} /> আমন্ত্রণ গ্রহণের আগে কোনো অবস্থান শেয়ার হয় না। প্রাপক নিজের শেয়ার যে কোনো সময় বন্ধ করতে পারেন।</div>
          </section>
          <footer className="app-footer">FindMyDeviceBD <span>·</span> সম্মতি ছাড়া লোকেশন শেয়ার নয়</footer>
        </div>
      </section>
    </main>
  );
}

export default App;
