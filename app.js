'use strict';
const BW=288,BH=24,WW=320,WH=224,HI=10,CHUNK=3584,TILE_BASE=0x1dc,MAX_TILES=800;
const bayer={'Bayer 2x2':[[0,2],[3,1]],'Bayer 4x4':[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]],'Bayer 8x8':[[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]]};
const presets={'Neutro':[1,0,0],'P&B':[0,0,0],'Vermelho':[0,0,1],'Âmbar':[0,38,1],'Verde':[0,120,1],'Ciano':[0,190,1],'Azul':[0,240,1],'Roxo':[0,285,1],'Sépia quente':[.25,32,.65],'Azul frio':[.35,225,.65],'Arcade pop':[1.35,0,0]};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),md9=(r,g,b)=>((Math.min(7,Math.floor((b+18)/36))*2)<<8)|((Math.min(7,Math.floor((g+18)/36))*2)<<4)|(Math.min(7,Math.floor((r+18)/36))*2),rgb=c=>[(c>>1&7)*36,(c>>5&7)*36,(c>>9&7)*36];
const defaults=()=>({zoom:1,offx:0,offy:0,dim:.55,saturation:1,tint_hue:0,tint_amount:0,dither:'Nenhum',dither_strength:.75,colorPreset:'Neutro'});
let kind='banner',state={banner:defaults(),wall:defaults(),integrated:{...defaults(),bannerX:16,bannerY:0}},img=null,images={banner:null,wall:null},renderId=0,finalData=null,drag=null;
const defaultAssets={banner:'assets/banner.png',wall:'assets/wallpaper.png',integrated:'assets/wallpaper.png'};
function loadDefault(k){const image=new Image();image.onload=()=>{if(!images[k])images[k]=image;if(kind===k){img=images[k];schedule()}};image.onerror=()=>{if(kind===k&&!img)$('stats').textContent='Imagem padrão ainda não enviada: '+defaultAssets[k]};image.src=defaultAssets[k]}

try{const v=JSON.parse(localStorage.getItem('edart-v1'));if(v?.banner&&v?.wall)state={...state,...v,integrated:{...state.integrated,...v.integrated}}}catch{}
const $=id=>document.getElementById(id),current=()=>state[kind],size=()=>kind==='banner'?[BW,BH]:[WW,WH];
const controlDefs=[['zoom','Zoom',1,5,.01],['offx','Deslocamento X',-300,300,1],['offy','Deslocamento Y',-200,200,1],['dim','Brilho / dim',.15,1,.01],['saturation','Saturação',0,2,.01],['tint_hue','Tint / matiz',0,360,1],['tint_amount','Força do tint',0,1,.01],['dither_strength','Intensidade do dither',0,1,.01]];
function saveState(){localStorage.setItem('edart-v1',JSON.stringify(state))}
function buildControls(){const el=$('controls');el.innerHTML='';for(const [key,label,min,max,step] of controlDefs){if(key==='dim'&&kind==='banner')continue;const row=document.createElement('label');row.textContent=label;const val=document.createElement('span');val.textContent=current()[key];const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step,value:current()[key]});input.oninput=()=>{current()[key]=+input.value;val.textContent=input.value;saveState();schedule()};row.append(val,input);el.append(row)}$('dither').value=current().dither;$('colorPreset').value=current().colorPreset;$('integratedControls').hidden=kind!=='integrated';$('export').textContent=kind==='integrated'?'Exportar WALL.ART + BANNER.ART':'Exportar ART';if(kind==='integrated'){for(const [id,key] of [['bannerX','bannerX'],['bannerY','bannerY']]){$(id).value=current()[key];$(id+'Value').textContent=current()[key]}}const [w,h]=size();for(const id of ['source','preview']){const c=$(id);c.width=w;c.height=h;c.style.aspectRatio=w+'/'+h}schedule()}
function hueRGB(deg){let h=((deg%360)+360)%360/60,x=1-Math.abs(h%2-1);return (h<1?[1,x,0]:h<2?[x,1,0]:h<3?[0,1,x]:h<4?[0,x,1]:h<5?[x,0,1]:[1,0,x]).map(x=>x*255)}
function baseImage(){const [w,h]=size(),c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);if(!img)return c;const s=current(),scale=Math.max(w/img.width,h/img.height)*s.zoom,rw=img.width*scale,rh=img.height*scale;ctx.imageSmoothingQuality='high';ctx.drawImage(img,(w-rw)/2+s.offx,(h-rh)/2+s.offy,rw,rh);let d=ctx.getImageData(0,0,w,h),a=d.data,t=hueRGB(s.tint_hue);for(let i=0;i<a.length;i+=4){let r=a[i],g=a[i+1],b=a[i+2],gray=.299*r+.587*g+.114*b;r=gray+(r-gray)*s.saturation;g=gray+(g-gray)*s.saturation;b=gray+(b-gray)*s.saturation;let lum=.299*r+.587*g+.114*b;for(let j=0;j<3;j++){let v=[r,g,b][j],tinted=lum*t[j]/255;a[i+j]=clamp(Math.round(((1-s.tint_amount)*v+s.tint_amount*tinted)*(kind==='wall'||kind==='integrated'?s.dim:1)),0,255)}}ctx.putImageData(d,0,0);return c}
function pixels(canvas){const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,out=[];for(let i=0;i<a.length;i+=4)out.push([a[i],a[i+1],a[i+2]]);return out}
function paletteFor(px,n){let hist=new Map();for(const p of px){let code=md9(...p);hist.set(code,(hist.get(code)||0)+1)}let items=[...hist].map(([code,count])=>({code,count,c:rgb(code)})),boxes=[items];while(boxes.length<n){let choice=-1,score=-1,axis=0;boxes.forEach((box,i)=>{if(box.length<2)return;for(let k=0;k<3;k++){let values=box.map(x=>x.c[k]),range=Math.max(...values)-Math.min(...values),weight=box.reduce((s,x)=>s+x.count,0),v=range*weight;if(v>score){score=v;choice=i;axis=k}}});if(choice<0)break;let box=boxes.splice(choice,1)[0];box.sort((a,b)=>a.c[axis]-b.c[axis]);let total=box.reduce((s,x)=>s+x.count,0),acc=0,cut=1;for(let i=0;i<box.length-1;i++){acc+=box[i].count;if(acc>=total/2){cut=i+1;break}}boxes.push(box.slice(0,cut),box.slice(cut))}return boxes.map(box=>{let weight=box.reduce((s,x)=>s+x.count,0),v=[0,1,2].map(k=>box.reduce((s,x)=>s+x.c[k]*x.count,0)/weight);return md9(...v)})}
function nearest(p,colors){let best=0,dist=Infinity;for(let i=0;i<colors.length;i++){let q=colors[i],d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;if(d<dist){dist=d;best=i}}return best}
function quantize(px,w,h,n,method,strength){let codes=paletteFor(px,n),colors=codes.map(rgb),indices=new Uint8Array(px.length);if(method==='Floyd-Steinberg'){let arr=px.map(p=>p.slice());for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x,p=arr[i],ix=nearest(p,colors);indices[i]=ix;let e=p.map((v,k)=>(v-colors[ix][k])*strength);for(const [dx,dy,f] of [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]]){let xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy<h){let j=yy*w+xx;for(let k=0;k<3;k++)arr[j][k]=clamp(arr[j][k]+e[k]*f,0,255)}}}}else{let mat=bayer[method],m=mat?.length;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x,bias=m?((mat[y%m][x%m]+.5)/(m*m)-.5)*72*strength:0;indices[i]=nearest(px[i].map(v=>clamp(v+bias,0,255)),colors)}}return {codes,indices,colors}}
const be16=(out,v)=>{out.push((v>>8)&255,v&255)},pad=out=>{while(out.length%CHUNK)out.push(0)};
function banner(px,w,h,s){let q=quantize(px,w,h,13,s.dither,s.dither_strength),codes=[...new Set(q.codes.filter(c=>c!==HI))].slice(0,13),pal=new Array(16).fill(0),map=new Map([[HI,1]]);codes.forEach((c,i)=>{pal[i+2]=c;map.set(c,i+2)});let indexed=Array.from(q.indices,i=>{let c=q.codes[i];if(map.has(c))return map.get(c);return codes.length?map.get(codes[nearest(rgb(c),codes.map(rgb))]):2});let out=[];pal.forEach(v=>be16(out,v));for(let ty=0;ty<3;ty++)for(let tx=0;tx<36;tx++)for(let y=0;y<8;y++)for(let x=0;x<8;x+=2){let a=(ty*8+y)*w+tx*8+x;out.push(indexed[a]*16+indexed[a+1])}pad(out);return {bytes:new Uint8Array(out),preview:indexed.map(i=>rgb(pal[i])),count:codes.length}}
function flipH(t){let a=[];for(let y=0;y<8;y++)for(let x=7;x>=0;x--)a.push(t[y*8+x]);return a}function flipV(t){let a=[];for(let y=7;y>=0;y--)for(let x=0;x<8;x++)a.push(t[y*8+x]);return a}
function wallpaper(px,w,h,s){
  const q=quantize(px,w,h,15,s.dither,s.dither_strength),seen=new Set(),keep=[];
  for(const i of q.indices){const c=q.codes[i];if(c!==0&&!seen.has(c)){seen.add(c);if(keep.length<14)keep.push(c)}}
  const pal=new Array(16).fill(0),idx=new Map([[0,0]]);
  keep.forEach((c,i)=>{pal[i+1]=c;idx.set(c,i+1)});
  const cols=pal.map(rgb),indexed=Array.from(q.indices,i=>{const c=q.codes[i];return idx.has(c)?idx.get(c):nearest(rgb(c),cols)});
  const tiles=[],refs=[],lookup=new Map();
  for(let ty=0;ty<28;ty++)for(let tx=0;tx<40;tx++){
    const tile=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)tile.push(indexed[(ty*8+y)*w+tx*8+x]);
    let found=null;
    for(const [flipped,flag] of [[tile,0],[flipH(tile),0x800],[flipV(tile),0x1000],[flipV(flipH(tile)),0x1800]]){
      const key=flipped.join('');if(lookup.has(key)){found=[lookup.get(key),flag];break}
    }
    if(found)refs.push(found);
    else{lookup.set(tile.join(''),tiles.length);refs.push([tiles.length,0]);tiles.push(tile)}
  }
  const original=tiles.length,owner=tiles.map((_,i)=>i),active=tiles.map((_,i)=>i);
  if(active.length>MAX_TILES){
    const vectors=tiles.map(t=>t.map(i=>cols[i]));
    const sums=vectors.map(t=>[0,1,2].map(k=>t.reduce((a,c)=>a+c[k],0)));
    // Weight tile boundaries more strongly to preserve continuity across 8x8 blocks.
    const edgeWeight=p=>{const x=p&7,y=p>>3;return x===0||x===7||y===0||y===7?3:1};
    const distance=(a,b)=>{let d=0;for(let p=0;p<64;p++){const va=vectors[a][p],vb=vectors[b][p],weight=edgeWeight(p);d+=weight*(Math.abs(va[0]-vb[0])+Math.abs(va[1]-vb[1])+Math.abs(va[2]-vb[2]))}return d};
    while(active.length>MAX_TILES){
      const sorted=active.slice().sort((a,b)=>sums[a][0]-sums[b][0]||sums[a][1]-sums[b][1]||sums[a][2]-sums[b][2]);
      let best=Infinity,keepId=-1,drop=-1;
      for(let j=0;j<sorted.length;j++)for(let k=j+1;k<Math.min(j+8,sorted.length);k++){
        const a=sorted[j],b=sorted[k],dist=distance(a,b);
        if(dist<best){best=dist;keepId=a;drop=b}
      }
      if(drop<0)throw Error('Não foi possível reduzir tiles');
      active.splice(active.indexOf(drop),1);
      for(let i=0;i<owner.length;i++)if(owner[i]===drop)owner[i]=keepId;
    }
  }
  const slot=new Map(active.map((v,i)=>[v,i])),out=[];
  be16(out,active.length);pal.slice(1).forEach(v=>be16(out,v));
  for(const [n,flip] of refs)be16(out,0x2000|flip|(TILE_BASE+slot.get(owner[n])));
  for(const n of active){const tile=tiles[n];for(let i=0;i<64;i+=2)out.push(tile[i]*16+tile[i+1])}
  pad(out);
  // Reconstruct the preview from the final retained tiles and map references.
  // This is the exact image represented by WALL.ART, including tile merging and flips.
  const preview=new Array(w*h);
  for(let ty=0;ty<28;ty++)for(let tx=0;tx<40;tx++){
    const [n,flip]=refs[ty*40+tx],tile=tiles[owner[n]];
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sx=flip&0x800?7-x:x,sy=flip&0x1000?7-y:y;
      preview[(ty*8+y)*w+tx*8+x]=cols[tile[sy*8+sx]];
    }
  }
  return {bytes:new Uint8Array(out),preview,original,count:active.length,colors:keep.length}
}
function drawGuide(canvas,x,y){let c=canvas.getContext('2d');c.save();c.strokeStyle='#ffdc55';c.lineWidth=1;c.setLineDash([4,3]);c.strokeRect(x+.5,y+.5,BW-1,BH-1);c.restore()}
function drawPixels(canvas,px){let ctx=canvas.getContext('2d'),im=ctx.createImageData(canvas.width,canvas.height);px.forEach((p,i)=>{im.data.set(p,i*4);im.data[i*4+3]=255});ctx.putImageData(im,0,0)}
function schedule(){const id=++renderId;setTimeout(()=>{if(id!==renderId)return;render()},130)}
function render(){if(!img){$('stats').textContent='Carregue uma imagem para começar.';return}const c=baseImage(),[w,h]=size();$('source').getContext('2d').drawImage(c,0,0);$('stats').textContent='Convertendo…';const requestedKind=kind,requestedId=renderId;setTimeout(()=>{if(requestedKind!==kind||requestedId!==renderId)return;try{let p=pixels(c),s=current();if(kind==='integrated'){let wall=wallpaper(p,w,h,s),x=clamp(Math.round(s.bannerX),0,32),y=clamp(Math.round(s.bannerY),0,200),crop=[];for(let yy=0;yy<BH;yy++)for(let xx=0;xx<BW;xx++)crop.push(p[(y+yy)*w+x+xx]);let ban=banner(crop,BW,BH,s);finalData={wall:wall.bytes,banner:ban.bytes};drawPixels($('preview'),wall.preview);drawGuide($('preview'),x,y);drawGuide($('source'),x,y);$('stats').textContent='Modo integrado: '+wall.count+'/800 tiles • banner em X='+x+', Y='+y+' • WALL.ART '+wall.bytes.length+' bytes + BANNER.ART '+ban.bytes.length+' bytes. A moldura é apenas uma guia.'}else{let r=kind==='banner'?banner(p,w,h,s):wallpaper(p,w,h,s);finalData=r.bytes;drawPixels($('preview'),r.preview);$('stats').textContent=kind==='banner'?r.count+' cores • '+r.bytes.length+' bytes':r.original+' tiles originais → '+r.count+'/800 • '+r.colors+' cores + preto • '+r.bytes.length+' bytes'}}catch(e){finalData=null;$('stats').textContent='Erro: '+e.message}},10)}
function download(name,bytes,type='application/octet-stream'){let blob=new Blob([bytes],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
$('file').onchange=e=>{const f=e.target.files[0];if(!f)return;const url=URL.createObjectURL(f),im=new Image();im.onload=()=>{img=im;images[kind]=im;URL.revokeObjectURL(url);schedule()};im.src=url};$('export').onclick=()=>{if(!finalData){alert('Carregue e converta uma imagem primeiro.');return}if(kind==='integrated'){download('WALL.ART',finalData.wall);setTimeout(()=>download('BANNER.ART',finalData.banner),250);$('stats').textContent+=' • Se o navegador bloquear o segundo download, permita downloads múltiplos para este site.'}else download(kind==='banner'?'BANNER.ART':'WALL.ART',finalData)};
$('dither').onchange=e=>{current().dither=e.target.value;saveState();schedule()};$('colorPreset').onchange=e=>{let [sat,hue,amount]=presets[e.target.value];Object.assign(current(),{colorPreset:e.target.value,saturation:sat,tint_hue:hue,tint_amount:amount});saveState();buildControls()};$('reset').onclick=()=>{state[kind]=defaults();saveState();buildControls()};$('save').onclick=()=>download('mega_everdrive_'+kind+'_preset.json',new TextEncoder().encode(JSON.stringify({kind,...current()},null,2)),'application/json');$('presetFile').onchange=async e=>{try{let obj=JSON.parse(await e.target.files[0].text());for(let k of Object.keys(defaults()))if(k in obj)current()[k]=obj[k];saveState();buildControls()}catch(err){alert('Preset inválido: '+err.message)}};
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');kind=btn.dataset.kind;img=images[kind]||(kind==='integrated'?images.wall:null);finalData=null;buildControls()});
$('source').onpointerdown=e=>{drag=[e.clientX,e.clientY,current().offx,current().offy];$('source').setPointerCapture(e.pointerId)};$('source').onpointermove=e=>{if(!drag)return;let rect=$('source').getBoundingClientRect(),[w,h]=size();current().offx=drag[2]+(e.clientX-drag[0])*w/rect.width;current().offy=drag[3]+(e.clientY-drag[1])*h/rect.height;saveState();schedule()};$('source').onpointerup=()=>{drag=null;buildControls()};$('source').onwheel=e=>{e.preventDefault();current().zoom=clamp(current().zoom*(e.deltaY<0?1.12:1/1.12),1,5);saveState();buildControls()};$('source').ondblclick=()=>{Object.assign(current(),{zoom:1,offx:0,offy:0});saveState();buildControls()};for(const [id,key] of [['bannerX','bannerX'],['bannerY','bannerY']])$(id).oninput=e=>{current()[key]=+e.target.value;$(id+'Value').textContent=e.target.value;saveState();schedule()};buildControls();loadDefault('banner');loadDefault('wall');loadDefault('integrated');