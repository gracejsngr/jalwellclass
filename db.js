import { readSession, cookieOf } from "../lib/auth.js";
import { getDoc, setDoc, allDocs, storeReady } from "../lib/store.js";
import { forStudent, mergeStudentWrite } from "../lib/filter.js";

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
