// 기록 읽기·쓰기 (독립 파일)
// 입장 쿠키 서명·확인 (서버 함수와 미들웨어가 함께 씀)
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function key(secret){
  return crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign", "verify"]);
}
async function signSession(role, days, secret){
  const body = b64u(enc.encode(JSON.stringify({r:role, e:Date.now() + days * 864e5})));
  const sig = b64u(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return body + "." + sig;
}
async function readSession(token, secret){
  if(!token || !secret) return null;
  const [body, sig] = token.split(".");
  if(!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64u(sig), enc.encode(body));
    if(!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    if(!p.e || p.e < Date.now() || !["teacher", "student"].includes(p.r)) return null;
    return p;
  } catch(e){ return null; }
}
function cookieOf(header, name){
  const m = (header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}

// Upstash Redis (Vercel Marketplace에서 연결) REST 호출
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const storeReady = () => !!(URL_ && TOKEN);
async function redis(...cmd){
  const r = await fetch(URL_, {method:"POST", headers:{Authorization:"Bearer " + TOKEN, "Content-Type":"application/json"}, body:JSON.stringify(cmd)});
  const j = await r.json();
  if(j.error) throw new Error(j.error);
  return j.result;
}
const H = "jw:docs";
async function getDoc(id){ const v = await redis("HGET", H, id); return v == null ? null : JSON.parse(v); }
async function setDoc(id, v){ await redis("HSET", H, id, JSON.stringify(v)); }
async function allDocs(){
  const arr = await redis("HGETALL", H) || [], out = {};
  for(let i = 0; i < arr.length; i += 2) out[arr[i]] = JSON.parse(arr[i + 1]);
  return out;
}

// 학생 코드로 들어온 사람에게 보여 줄 것만 남기고, 학생이 바꿀 수 있는 칸만 허용

const CORE_READ = ["events","handouts","meals","mealImgs","notices","photos","praises","predictions","quests","roles","timetable","ttOver","subjectPosts","students","settings"];
const CORE_WRITE = ["predictions","quests","praises","subjectPosts"];
const MONTH_READ = ["late","lessons"];
const MONTH_WRITE = ["late"];
const SETTINGS_READ = ["brand","brandTag","className","ddays","fields","motto","rules","wxPlace"];

const lockPin = () => "locked-" + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join(""); // 학생 화면에서는 어떤 숫자로도 열리지 않음

function forStudent(id, v){
  if(!v || typeof v !== "object") return v;
  const out = {};
  if(id === "core"){
    for(const k of CORE_READ) if(k in v) out[k] = v[k];
    out.students = (v.students || []).map(s => ({id:s.id, no:s.no, active:s.active}));
    const st = v.settings || {}, s2 = {};
    for(const k of SETTINGS_READ) if(k in st) s2[k] = st[k];
    s2.hideNames = true; s2.teacherPin = lockPin(); if(st.roomPin) s2.roomPin = lockPin();
    out.settings = s2;
    return out;
  }
  if(id.startsWith("m-")){ for(const k of MONTH_READ) if(k in v) out[k] = v[k]; return out; }
  return null;
}
function mergeStudentWrite(id, server, incoming){
  const allow = id === "core" ? CORE_WRITE : id.startsWith("m-") ? MONTH_WRITE : [];
  const merged = Object.assign({}, server || {});
  for(const k of allow) if(incoming && k in incoming) merged[k] = incoming[k];
  return merged;
}


const okId = id => id === "core" || /^m-\d{4}-\d{2}$/.test(id);

export default async function handler(req, res){
  const s = await readSession(cookieOf(req.headers.cookie, "jw"), process.env.SESSION_SECRET);
  if(!s) return res.status(401).json({error:"다시 입장해 주세요"});
  if(!storeReady()) return res.status(500).json({error:"저장소(Upstash Redis)가 아직 연결되지 않았어요"});
  res.setHeader("Cache-Control", "no-store");
  const teacher = s.r === "teacher";
  try {
    if(req.method === "GET"){
      if(req.query.list){
        const all = await allDocs(), docs = {};
        for(const [id, v] of Object.entries(all)){ if(!okId(id)) continue; const x = teacher ? v : forStudent(id, v); if(x != null) docs[id] = x; }
        return res.status(200).json({docs, role:s.r});
      }
      const id = String(req.query.id || ""); if(!okId(id)) return res.status(400).json({error:"잘못된 문서"});
      const v = await getDoc(id);
      return res.status(200).json({v: v == null ? null : teacher ? v : forStudent(id, v)});
    }
    if(req.method === "PUT"){
      const id = String(req.query.id || ""); if(!okId(id)) return res.status(400).json({error:"잘못된 문서"});
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      if(JSON.stringify(body).length > 900000) return res.status(413).json({error:"너무 커요"});
      if(teacher){ await setDoc(id, body.v || {}); return res.status(200).json({ok:true}); }
      const merged = mergeStudentWrite(id, await getDoc(id), body.v || {});
      await setDoc(id, merged);
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:"지원하지 않는 요청"});
  } catch(e){ return res.status(500).json({error:"저장소 오류", detail:String(e.message || e).slice(0, 200)}); }
}
