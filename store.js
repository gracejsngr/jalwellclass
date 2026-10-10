// Upstash Redis (Vercel Marketplace에서 연결) REST 호출
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const storeReady = () => !!(URL_ && TOKEN);
export async function redis(...cmd){
  const r = await fetch(URL_, {method:"POST", headers:{Authorization:"Bearer " + TOKEN, "Content-Type":"application/json"}, body:JSON.stringify(cmd)});
  const j = await r.json();
  if(j.error) throw new Error(j.error);
  return j.result;
}
const H = "jw:docs";
export async function getDoc(id){ const v = await redis("HGET", H, id); return v == null ? null : JSON.parse(v); }
export async function setDoc(id, v){ await redis("HSET", H, id, JSON.stringify(v)); }
export async function allDocs(){
  const arr = await redis("HGETALL", H) || [], out = {};
  for(let i = 0; i < arr.length; i += 2) out[arr[i]] = JSON.parse(arr[i + 1]);
  return out;
}
