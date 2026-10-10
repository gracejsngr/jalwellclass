// 학생 코드로 들어온 사람에게 보여 줄 것만 남기고, 학생이 바꿀 수 있는 칸만 허용
import { randomBytes } from "node:crypto";

const CORE_READ = ["events","handouts","meals","mealImgs","notices","photos","praises","predictions","quests","roles","timetable","ttOver","subjectPosts","students","settings"];
const CORE_WRITE = ["predictions","quests","praises","subjectPosts"];
const MONTH_READ = ["late","lessons"];
const MONTH_WRITE = ["late"];
const SETTINGS_READ = ["brand","brandTag","className","ddays","fields","motto","rules","wxPlace"];

const lockPin = () => "locked-" + randomBytes(12).toString("hex"); // 학생 화면에서는 어떤 숫자로도 열리지 않음

export function forStudent(id, v){
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
export function mergeStudentWrite(id, server, incoming){
  const allow = id === "core" ? CORE_WRITE : id.startsWith("m-") ? MONTH_WRITE : [];
  const merged = Object.assign({}, server || {});
  for(const k of allow) if(incoming && k in incoming) merged[k] = incoming[k];
  return merged;
}
