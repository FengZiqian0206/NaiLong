import * as THREE from '../vendor/three.module.min.js';
import {WORLD,samplePath} from './world.js?v=20261120f';
import {PANELS,TRANSITION,panelAt,transitionTop,worldAt} from './scenes.js?v=20261120f';

// A separate garden approach connects the house to the school. It occupies
// real route length, rather than overlaying or repeating either illustration.
function gardenTexture() {
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;
  const c=canvas.getContext('2d');
  const sky=c.createLinearGradient(0,0,1600,350);
  sky.addColorStop(0,'#aabda7');sky.addColorStop(.5,'#b1d8d5');sky.addColorStop(1,'#58b9ee');
  c.fillStyle=sky;c.fillRect(0,0,1600,900);
  c.fillStyle='#e6efdb';
  for(let i=0;i<12;i++) {
    c.beginPath();c.ellipse(120+i*147,130+(i%3)*47,110,30,0,0,Math.PI*2);c.fill();
  }
  // Distant garden canopy, then a low fence leading towards the school.
  for(let i=0;i<42;i++) {
    c.fillStyle=['#739c81','#8eb893','#a3c69a'][i%3];
    c.beginPath();c.ellipse(i*43,400+Math.sin(i*1.7)*38,82,110,0,0,Math.PI*2);c.fill();
  }
  c.lineWidth=7;c.strokeStyle='#6c8b7a';
  for(const y of [440,486,530]) {c.beginPath();c.moveTo(0,y);c.lineTo(1600,y);c.stroke();}
  c.lineWidth=4;
  for(let x=0;x<1600;x+=43){c.beginPath();c.moveTo(x,440);c.lineTo(x,550);c.stroke();}
  for(const [x,size] of [[100,1],[500,.7],[1120,.8],[1540,1.2]]) {
    c.fillStyle='#7a7756';c.fillRect(x-13,180,26,375);
    for(let j=0;j<28;j++) {
      const a=j*2.4,r=50+(j%5)*22;
      c.fillStyle=['#558a65','#719b61','#96b86e','#b1c780'][j%4];
      c.beginPath();c.ellipse(x+Math.cos(a)*r*size,190+Math.sin(a)*r*size,60*size,43*size,a,0,Math.PI*2);c.fill();
    }
  }
  for(let i=0;i<34;i++) {
    const x=i*49,y=536-Math.sin(i*1.4)*10;
    c.fillStyle=['#658951','#7e9f59','#99b467'][i%3];
    c.beginPath();c.ellipse(x,y,45,28,0,0,Math.PI*2);c.fill();
    if(i%3===0){c.fillStyle='#e5cc86';c.beginPath();c.arc(x+12,y-13,5,0,Math.PI*2);c.fill();}
  }
  const soil=c.createLinearGradient(0,562.5,1600,900);
  soil.addColorStop(0,'#425f56');soil.addColorStop(.5,'#385f66');soil.addColorStop(1,'#284b73');
  c.fillStyle=soil;c.fillRect(0,562.5,1600,338);
  const paving=c.createLinearGradient(0,0,1600,0);
  paving.addColorStop(0,'#dfc59b');paving.addColorStop(.5,'#d7d6bc');paving.addColorStop(1,'#bcd6df');
  c.fillStyle=paving;c.fillRect(0,562.5,1600,17);
  c.fillStyle='#f5e9ca';c.fillRect(0,562.5,1600,4);
  c.strokeStyle='#829b94';c.lineWidth=2;
  for(let x=0;x<1600;x+=64){c.beginPath();c.moveTo(x,565);c.lineTo(x+6,578);c.stroke();}
  for(let i=0;i<95;i++) {
    c.fillStyle=i%2?'#70927c':'#8aa079';
    c.fillRect((i*137)%1600,590+(i*19)%55,3,8+(i%4)*5);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

// Artwork and mask use the same un-repeated pixel-to-world mapping.
export async function addArtwork(scene) {
  const loader=new THREE.TextureLoader();
  const maps=await Promise.all([1,2].map(async number=>{
    const [art,mask]=await Promise.all([
      loader.loadAsync(new URL(`./assets/level${number}.png`,import.meta.url).href),
      loader.loadAsync(new URL(`./assets/level${number}_mask.jpg`,import.meta.url).href),
    ]);
    art.colorSpace=THREE.SRGBColorSpace;art.minFilter=THREE.LinearFilter;art.magFilter=THREE.LinearFilter;
    art.generateMipmaps=false;
    return {art,mask};
  }));
  const meshes=[];
  function meshStrip(panel,bottom,top,floor,uniforms,fragment) {
    const vertices=[],uv=[],indices=[],columns=Math.ceil(panel.length/.22),rows=24;
    for(let x=0;x<=columns;x++)for(let y=0;y<=rows;y++) {
      const u=x/columns,v=y/rows,s=panel.start+u*panel.length;
      const a=samplePath((s-.2)/WORLD.totalLength),b=samplePath((s+.2)/WORLD.totalLength);
      const turn=Math.abs(Math.atan2(a.tx*b.ty-a.ty*b.tx,a.tx*b.tx+a.ty*b.ty));
      // Only decorative soil is trimmed on the tight inner curls.
      const safeBottom=-Math.max(panel.isPlaceholder ? .6 : 4,.24/Math.max(turn,.00001));
      const h=Math.max(safeBottom,bottom+v*(top-bottom))+floor(s);
      const p=worldAt(s,h);
      vertices.push(p.x,p.y,-2);uv.push(u,v);
      if(x<columns&&y<rows) {
        const i=x*(rows+1)+y;indices.push(i,i+rows+1,i+1,i+1,i+rows+1,i+rows+2);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({
      uniforms:{...uniforms,panelStart:{value:panel.start},panelLength:{value:panel.length},focusS:{value:0},visibleRadius:{value:40}},
      vertexShader:'varying vec2 artworkUV;void main(){artworkUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float panelStart,panelLength,focusS,visibleRadius;varying vec2 artworkUV;
        ${fragment}
        void main(){vec4 color=paint(artworkUV);
          color.a*=1.-smoothstep(visibleRadius-2.,visibleRadius,abs(panelStart+artworkUV.x*panelLength-focusS));
          if(color.a<.005)discard;gl_FragColor=color;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side:THREE.DoubleSide,transparent:true,depthWrite:false,
    });
    const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);meshes.push({mesh,panel});
    return mesh;
  }
  for(const panel of PANELS) {
    if(panel.isPlaceholder) {
      meshStrip(panel,-3*panel.pixelScale,3*panel.pixelScale,()=>0,{},`
        vec4 paint(vec2 uv){
          float line=smoothstep(.94,.98,uv.y);
          vec3 color=mix(vec3(.32,.39,.36),vec3(.72,.76,.69),line);
          float joint=step(.975,fract(uv.x*panelLength/5.));
          color=mix(color,vec3(.52,.59,.54),joint*.35);
          return vec4(color,smoothstep(0.,.12,uv.y));
        }`);
      continue;
    }
    meshStrip(panel,(panel.baseline-panel.source.height)*panel.pixelScale,panel.baseline*panel.pixelScale,()=>0,
      {art:{value:maps[panel.index].art},mask:{value:maps[panel.index].mask},fadeSide:{value:panel.index===0?1:-1}},`
        uniform sampler2D art,mask;uniform float fadeSide;
        vec4 paint(vec2 uv){
          vec4 color=texture2D(art,uv);
          float black=min(texture2D(mask,uv).r,min(texture2D(mask,uv+vec2(0.,.004)).r,texture2D(mask,uv-vec2(0.,.004)).r));
          float edge=fadeSide>0.?(1.-uv.x)*panelLength:uv.x*panelLength;
          color.a*=mix(1.,smoothstep(0.,5.,edge),smoothstep(.15,.7,black));
          color.a*=smoothstep(0.,.025,uv.y)*(1.-smoothstep(.97,1.,uv.y));
          return color;
        }`);
  }
  const garden={start:TRANSITION.start-5,length:TRANSITION.length+10};
  const bridge=meshStrip(garden,-6,10,transitionTop,{art:{value:gardenTexture()}},`
    uniform sampler2D art;
    vec4 paint(vec2 uv){vec4 color=texture2D(art,uv);color.a*=smoothstep(0.,.05,uv.y)*(1.-smoothstep(.94,1.,uv.y));return color;}`);
  bridge.userData.background=true;
  const colors=[new THREE.Color('#9bb3a1'),new THREE.Color('#83bce9'),new THREE.Color('#c7cdc0')];
  return (progress,viewWidth,viewHeight,edgeFraming=0)=>{
    const s=progress*WORLD.totalLength,center=s+edgeFraming,visibleRadius=Math.max(viewWidth/2,viewHeight*.3)+3;
    for(const {mesh,panel} of meshes) {
      const distance=Math.abs(panel.start+panel.length/2-s);
      mesh.visible=panel.start+panel.length>=center-visibleRadius&&panel.start<=center+visibleRadius;
      mesh.renderOrder=mesh.userData.background?-100:100-Math.floor(distance);
      mesh.material.uniforms.focusS.value=center;mesh.material.uniforms.visibleRadius.value=visibleRadius;
    }
    if(s>=TRANSITION.start-5&&s<=TRANSITION.end+5) {
      const t=THREE.MathUtils.smoothstep(s,TRANSITION.start-5,TRANSITION.end+5);
      scene.background.copy(colors[0]).lerp(colors[1],t);
    } else {
      const panel=panelAt(s),index=panel?.sceneIndex??0;
      scene.background.copy(colors[Math.min(index,2)]);
      if(index===1) scene.background.lerp(colors[2],THREE.MathUtils.smoothstep(s,panel.start+panel.length-8,panel.start+panel.length));
    }
  };
}
