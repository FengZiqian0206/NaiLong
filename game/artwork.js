import * as THREE from '../vendor/three.module.min.js';
import {WORLD} from './world.js?v=20261123b';
import {PANELS,TRANSITIONS,sceneAt,transitionAt,transitionTop,worldAt} from './scenes.js?v=20261123b';

const edgeBlend=7.5;
const transitionPaint=`
  uniform sampler2D art;
  uniform vec2 crop;
  vec4 paint(vec2 uv){
    vec4 color=texture2D(art,vec2(mix(crop.x,crop.y,uv.x),uv.y));
    color.a*=smoothstep(0.,.018,uv.x)*(1.-smoothstep(.982,1.,uv.x));
    color.a*=smoothstep(0.,.07,uv.y)*(1.-smoothstep(.97,1.,uv.y));
    return color;
  }`;

export async function addArtwork(scene) {
  const loader=new THREE.TextureLoader();
  async function loadTexture(filename,isColor=true) {
    const texture=await loader.loadAsync(new URL('./assets/'+filename,import.meta.url).href);
    if(isColor) texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  const maskedScenes=new Set([0,1,3]);
  const [maps,bridges]=await Promise.all([
    Promise.all(PANELS.map(async panel=>{
      if(!panel.image) return null;
      const [art,mask]=await Promise.all([
        loadTexture(panel.image),
        maskedScenes.has(panel.index)?loadTexture('level'+(panel.index+1)+'_mask.jpg',false):null,
      ]);
      return {art,mask};
    })),
    Promise.all(TRANSITIONS.map(transition=>transition.image?loadTexture(transition.image):null)),
  ]);
  const meshes=[];
  function meshStrip(start,end,bottom,top,floor,uniforms,fragment,renderOrder=0) {
    const vertices=[],uv=[],indices=[];
    const columns=Math.ceil((end-start)/.25);
    for(let i=0;i<=columns;i++) {
      const u=i/columns,s=start+(end-start)*u;
      const h=floor(s);
      const low=worldAt(s,h+bottom),high=worldAt(s,h+top);
      vertices.push(low.x,low.y,-2,high.x,high.y,-2);
      uv.push(u,0,u,1);
      if(i<columns) indices.push(i*2,i*2+2,i*2+1,i*2+1,i*2+2,i*2+3);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({
      uniforms,
      vertexShader:`varying vec2 artworkUV;
        void main(){artworkUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 artworkUV;
        ${fragment}
        void main(){
          gl_FragColor=paint(artworkUV);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side:THREE.DoubleSide,transparent:true,depthWrite:false,
    });
    const mesh=new THREE.Mesh(geometry,material);
    mesh.renderOrder=renderOrder;
    scene.add(mesh);
    meshes.push({mesh,center:(start+end)/2,length:end-start});
  }
  function neutralRoad(start,end,floor) {
    meshStrip(start,end,-.3,0,floor,{},`
      vec4 paint(vec2 uv){
        vec3 color=mix(vec3(.26,.31,.29),vec3(.58,.64,.58),smoothstep(.68,.95,uv.y));
        return vec4(color,smoothstep(0.,.2,uv.y));
      }`, -1);
  }

  for(const panel of PANELS) {
    const {index,baseline,pixelScale,source,start,length}=panel;
    const map=maps[index],end=start+length;
    if(!map) {
      neutralRoad(start,end,()=>3*pixelScale);
      continue;
    }
    const previous=TRANSITIONS[(index+PANELS.length-1)%PANELS.length];
    const next=TRANSITIONS[index];
    meshStrip(start,end,(baseline-source.height)*pixelScale,baseline*pixelScale,()=>0,{
      art:{value:map.art},
      mask:{value:map.mask??map.art},
      hasMask:{value:Number(Boolean(map.mask))},
      fadeIn:{value:previous.image?edgeBlend/length:0},
      fadeOut:{value:next.image?edgeBlend/length:0},
      floorUV:{value:1-baseline/source.height},
    },`
      uniform sampler2D art,mask;
      uniform float hasMask,fadeIn,fadeOut,floorUV;
      vec4 paint(vec2 uv){
        vec4 color=texture2D(art,uv);
        float edgeFade=(fadeIn>0.?smoothstep(0.,fadeIn,uv.x):1.)*
          (fadeOut>0.?smoothstep(0.,fadeOut,1.-uv.x):1.);
        float black=min(texture2D(mask,uv).r,
          min(texture2D(mask,uv+vec2(0.,.004)).r,texture2D(mask,uv-vec2(0.,.004)).r));
        // Raised platforms retain their visible contact surfaces; the two
        // pavement layers blend together across the seam.
        float elevated=smoothstep(.019,.035,uv.y-floorUV);
        float keep=elevated*hasMask*(1.-smoothstep(.15,.7,black));
        color.a*=mix(edgeFade,1.,keep);
        color.a*=smoothstep(0.,.03,uv.y)*(1.-smoothstep(.98,1.,uv.y));
        return color;
      }`);
  }
  for(const transition of TRANSITIONS) {
    const {index,groundStart,start,end}=transition;
    const top=s=>transitionTop(transition,s);
    if(!bridges[index]) {
      neutralRoad(groundStart,end,top);
      continue;
    }
    // Match the supplied plate to nearby landmarks at the scene joins. Keep
    // the same source-pixel scale along the ground and vertically.
    const firstPixel=index===0?560:550;
    const groundRow=index===0?609:598;
    const endRow=index===0?602:598;
    const scale=PANELS[index].pixelScale;
    const {width,height}=bridges[index].image;
    const extendedStart=start-edgeBlend,extendedEnd=end+edgeBlend;
    const firstU=(firstPixel-edgeBlend/scale)/width;
    const lastU=firstU+(extendedEnd-extendedStart)/(scale*width);
    const alignedFloor=s=>top(s)+(endRow-groundRow)*
      THREE.MathUtils.smoothstep(s,start,end)*scale;
    meshStrip(extendedStart,extendedEnd,(groundRow-height)*scale,groundRow*scale,alignedFloor,{
      art:{value:bridges[index]},
      crop:{value:new THREE.Vector2(firstU,lastU)},
    },transitionPaint,-2);
  }

  const colors=['#9bb3a1','#83bce9','#302238','#0b2231','#c7cdc0','#c7cdc0'].map(color=>new THREE.Color(color));
  return (progress,width,height)=>{
    const s=progress*WORLD.totalLength;
    const visibleRadius=Math.max(width*.65,height*.55)+10;
    for(const {mesh,center,length} of meshes) {
      const delta=Math.abs(center-s);
      mesh.visible=Math.min(delta,Math.abs(WORLD.totalLength-delta))<visibleRadius+length/2;
    }
    const index=sceneAt(s),transition=transitionAt(s);
    scene.background.copy(colors[index]);
    if(transition) {
      const t=THREE.MathUtils.smoothstep(s,transition.start,transition.end);
      scene.background.lerp(colors[(index+1)%colors.length],t);
    }
  };
}
