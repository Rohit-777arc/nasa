import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const NASA_TEXTURE = "https://assets.science.nasa.gov/dynamicimage/assets/science/psd/lunar-science/2023/09/colormap.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1200&w=3927";

const root = document.getElementById("moon");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02050a);

const camera = new THREE.PerspectiveCamera(42, root.clientWidth/root.clientHeight, .1, 100);
camera.position.set(0,0,3.2);

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(root.clientWidth,root.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=.06; controls.minDistance=1.65; controls.maxDistance=6;
controls.enablePan=false;

const stars = new THREE.BufferGeometry();
const positions=[];
for(let i=0;i<1300;i++){
  const r=20+Math.random()*25, a=Math.random()*Math.PI*2, z=Math.random()*2-1;
  const q=Math.sqrt(1-z*z);
  positions.push(r*q*Math.cos(a),r*q*Math.sin(a),r*z);
}
stars.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0x9db5c9,size:.018,transparent:true,opacity:.7})));

const moonGroup=new THREE.Group(); scene.add(moonGroup);
const loader=new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
const texture=loader.load(NASA_TEXTURE,()=>{document.getElementById("dataStatus").textContent="NASA LRO MOSAIC LOADED";});
const moon=new THREE.Mesh(
  new THREE.SphereGeometry(1,160,160),
  new THREE.MeshStandardMaterial({
    map:texture, bumpMap:texture, bumpScale:.055, roughness:.96, metalness:0,
  })
);
moonGroup.add(moon);

const halo=new THREE.Mesh(
  new THREE.SphereGeometry(1.025,64,64),
  new THREE.MeshBasicMaterial({color:0x6ea9c8,transparent:true,opacity:.025,side:THREE.BackSide})
);
moonGroup.add(halo);

const sun=new THREE.DirectionalLight(0xffffff,2.2); sun.position.set(3,1.5,2.5); scene.add(sun);
scene.add(new THREE.AmbientLight(0x53677c,.12));

let marker=null, selected={lat:-5,lon:20};
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();

function xyzToLatLon(p){
  // Three.js sphere: +Z = 0° longitude, +X = 90°E.
  const lat=Math.asin(THREE.MathUtils.clamp(p.y,-1,1))*180/Math.PI;
  const lon=Math.atan2(p.x,p.z)*180/Math.PI;
  return {lat,lon};
}
function latLonToXYZ(lat,lon,r=1.02){
  const a=lat*Math.PI/180,b=lon*Math.PI/180;
  return new THREE.Vector3(r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b));
}
function selectFromPointer(e){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObject(moon)[0]; if(!hit)return;
  const ll=xyzToLatLon(hit.point.clone().normalize());
  selected=ll; updateSite();
  const projected=hit.point.clone().project(camera);
  const cross=document.getElementById("crosshair");
  cross.style.display="block"; cross.style.left=`${(projected.x*.5+.5)*100}%`; cross.style.top=`${(-projected.y*.5+.5)*100}%`;
}
renderer.domElement.addEventListener("click",selectFromPointer);

let nasaSite=null, nasaBusy=false;
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function fallbackMetrics(lat,lon){
  const r=Math.PI/180;
  const elevation=650+1850*Math.abs(Math.sin(lat*r))+280*Math.cos((lon-20)*r);
  const slope=1.2+11*Math.abs(Math.sin((lat*1.7+lon)*r));
  const temp=-165+92*Math.max(0,Math.cos(lat*r))*((Math.sin((lon+90)*r)+1)/2)+18*Math.sin(lon*r);
  const sunAlt=42*Math.cos(lat*r)+20*Math.sin((lon-25)*r);
  const sunAz=(180+lon*.8-lat*.2+360)%360;
  const illum=Math.max(0,Math.min(100,Math.round(50+50*Math.cos((lon-25)*r))));
  return {elevation,slope,temp,sunAlt,sunAz,illum,score:50};
}
function metrics(){
  const f=fallbackMetrics(selected.lat,selected.lon);
  if(!nasaSite?.lola && !nasaSite?.diviner) return {...f,source:'PROTOTYPE FALLBACK'};
  const l=nasaSite.lola||{}, d=nasaSite.diviner||{};
  const elevation=Number.isFinite(l.elevation_m)?l.elevation_m:f.elevation;
  const slope=Number.isFinite(l.slope_deg)?l.slope_deg:f.slope;
  const temp=Number.isFinite(d.brightness_temp_K)?d.brightness_temp_K-273.15:f.temp;
  const sunAlt=Number.isFinite(d.solar_incidence_deg)?90-d.solar_incidence_deg:f.sunAlt;
  const sunAz=Number.isFinite(d.solar_azimuth_deg)?d.solar_azimuth_deg:f.sunAz;
  const illum=Number.isFinite(d.solar_incidence_deg)?Math.round(clamp(100*Math.cos(d.solar_incidence_deg*Math.PI/180),0,100)):f.illum;
  const terrain=clamp(Math.round(100-slope*5),20,100);
  const thermal=clamp(Math.round(100-Math.abs(temp+80)*.25),30,100);
  const solar=clamp(Math.round(illum),0,100);
  const score=Math.round(.5*terrain+.3*thermal+.2*solar);
  return {elevation,slope,temp,sunAlt,sunAz,illum,terrain,thermal,solar,score,source:'NASA LIVE / LRO GDS'};
}
function earth(m){
  if(m.temp<-120)return ['Antarctic interior','Thermal/terrain candidate'];
  if(m.temp<-60)return ['High-altitude Andes','Cold, dry terrain candidate'];
  if(m.temp<-20)return ['Atacama Desert','Dry, high-solar terrain candidate'];
  return ['Namib Desert','Dry terrestrial terrain candidate'];
}
function setText(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
function updateSite(){
  const m=metrics(), e=earth(m);
  const ns=selected.lat>=0?'N':'S', ew=selected.lon>=0?'E':'W';
  setText('location',`${Math.abs(selected.lat).toFixed(2)}° ${ns}  •  ${Math.abs(selected.lon).toFixed(2)}° ${ew}`);
  setText('locationSub',nasaBusy?'Querying NASA LOLA + Diviner…':`Selected on the 3D lunar surface • ${m.source}`);
  setText('elev',`${Math.round(m.elevation)} m`); setText('slope',`${m.slope.toFixed(1)}°`);
  setText('temp',`${Math.round(m.temp)} °C`); setText('sunAlt',`${m.sunAlt.toFixed(1)}°`); setText('illum',`${m.illum}%`);
  setText('riskScore',m.score);
  const cls=m.score>=80?'LOW RELATIVE SCORE':m.score>=60?'MODERATE RELATIVE SCORE':'LOW CONFIDENCE / CHECK SITE';
  setText('siteClass',cls);
  document.getElementById('riskRing').style.borderColor=m.score>=80?'var(--green)':m.score>=60?'var(--amber)':'var(--red)';
  setText('earthName',e[0]); setText('earthDesc',`${e[1]}. This analogue is a prototype candidate, not a NASA-certified Earth match.`);
  const earthScore=Math.round((m.thermal+m.terrain+m.solar)/3); setText('earthScore',`${earthScore}%`);
  setText('aTemp',`${Math.round(m.temp)} °C`);setText('aElev',`${Math.round(m.elevation)} m`);
  setText('aSlope',`${m.slope.toFixed(1)}°`);setText('aSunAlt',`${m.sunAlt.toFixed(1)}°`);
  setText('aSunAz',`${m.sunAz.toFixed(0)}°`);setText('aIllum',`${m.illum}%`);
  setText('hSlope',m.slope<=8?'FAVOURABLE':m.slope<=12?'WATCH':'STEEP');
  setText('hLight',m.illum>=35?'ADEQUATE':'LOW LIGHT');
  setText('hTemp',Math.abs(m.temp)<120?'MEASURED BRIGHTNESS TEMP':'EXTREME / CHECK DATA');
  const thermal=Number.isFinite(m.thermal)?m.thermal:50, terrain=Number.isFinite(m.terrain)?m.terrain:50, solar=Number.isFinite(m.solar)?m.solar:50;
  [['bt',thermal],['bterr',terrain],['bsol',solar]].forEach(([id,v])=>document.getElementById(id).style.width=v+'%');
  setText('btv',thermal+'%');setText('bterrv',terrain+'%');setText('bsolv',solar+'%');
  if(marker)moonGroup.remove(marker);
  marker=new THREE.Mesh(new THREE.SphereGeometry(.018,20,20),new THREE.MeshBasicMaterial({color:0x72f5a5}));
  marker.position.copy(latLonToXYZ(selected.lat,selected.lon,1.025)); moonGroup.add(marker);
}
async function queryNASA(){
  nasaBusy=true; nasaSite=null; updateSite();
  try{
    const r=await fetch(`/api/site?lat=${encodeURIComponent(selected.lat)}&lon=${encodeURIComponent(selected.lon)}`);
    if(!r.ok) throw new Error('NASA backend returned '+r.status);
    nasaSite=await r.json();
    setText('dataStatus','NASA LUNAR DATA CONNECTED');
    setText('pdsStatus','NASA LOLA + DIVINER QUERY READY');
  }catch(err){
    console.warn(err); setText('dataStatus','NASA QUERY UNAVAILABLE — FALLBACK');
    setText('pdsStatus','NASA SERVICE TEMPORARILY UNAVAILABLE');
  }finally{nasaBusy=false; updateSite();}
}
updateSite();
queryNASA();

function resize(){const w=root.clientWidth,h=root.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}
window.addEventListener("resize",resize);
function animate(){requestAnimationFrame(animate);moonGroup.rotation.y+=.00035;controls.update();renderer.render(scene,camera);} animate();

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tabpage").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");document.getElementById(btn.dataset.tab).classList.add("active");
}));
document.getElementById("startSim").addEventListener("click",()=>{document.querySelector('[data-tab="sim"]').click();});
document.querySelectorAll("#sources a").forEach(a=>a.addEventListener("click",()=>{}));

// V6 presentation/demo mode
const demoOverlay=document.getElementById('demoOverlay');
const showDemo=()=>{demoOverlay.hidden=false;};
document.getElementById('demoMode')?.addEventListener('click',showDemo);
document.getElementById('demoClose')?.addEventListener('click',()=>demoOverlay.hidden=true);
document.getElementById('demoStart')?.addEventListener('click',()=>{
  demoOverlay.hidden=true;
  document.querySelector('[data-tab="analysis"]').click();
  setTimeout(()=>{ document.querySelector('[data-tab="sim"]').click(); setTimeout(()=>document.getElementById('run').click(),500); },1600);
});
