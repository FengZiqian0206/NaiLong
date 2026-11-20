import * as THREE from '../vendor/three.module.min.js';
import {WORLD,samplePath} from './world.js';
import {PANELS,SCENE_LENGTH,worldAt} from './scenes.js';

// Artwork and mask share exactly the same route/pixel-to-world mapping.
export async function addArtwork(scene) {
  const loader=new THREE.TextureLoader();
  const maps=await Promise.all([1,2].map(async number=>{
    const [art,mask]=await Promise.all([
      loader.loadAsync(new URL(`./assets/level${number}.png`,import.meta.url).href),
      loader.loadAsync(new URL(`./assets/level${number}_mask.jpg`,import.meta.url).href),
    ]);
    art.colorSpace=THREE.SRGBColorSpace;
    art.minFilter=THREE.LinearFilter;art.magFilter=THREE.LinearFilter;
    art.generateMipmaps=false;
    return {art,mask};
  }));
  const meshes=[];
  for(const panel of PANELS) {
    const before=PANELS[Math.max(0,panel.index-1)],after=PANELS[Math.min(PANELS.length-1,panel.index+1)];
    const vertices=[],uv=[],indices=[];
    const columns=Math.ceil(panel.length/.22),rows=24;
    for(let x=0;x<=columns;x++)for(let y=0;y<=rows;y++) {
      const u=x/columns,v=y/rows,s=panel.start+u*panel.length;
      const a=samplePath((s-.2)/WORLD.totalLength),b=samplePath((s+.2)/WORLD.totalLength);
      const turn=Math.abs(Math.atan2(a.tx*b.ty-a.ty*b.tx,a.tx*b.tx+a.ty*b.ty));
      // Trim only deep decorative soil on tight turns; every mask platform stays intact.
      const safeBottom=-Math.max(1.4,.24/Math.max(turn,.00001));
      const h=Math.max(safeBottom,(panel.baseline-panel.source.height+v*panel.source.height)*panel.pixelScale);
      const p=worldAt(s,h);
      vertices.push(p.x,p.y,-2);uv.push(u,v);
      if(x<columns && y<rows) {
        const i=x*(rows+1)+y;
        indices.push(i,i+rows+1,i+1,i+1,i+rows+1,i+rows+2);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({
      uniforms:{art:{value:maps[panel.sceneIndex%2].art},mask:{value:maps[panel.sceneIndex%2].mask},
        previous:{value:maps[before.sceneIndex%2].art},next:{value:maps[after.sceneIndex%2].art},
        previousShift:{value:(panel.baseline-before.baseline)/panel.source.height},
        nextShift:{value:(panel.baseline-after.baseline)/panel.source.height},
        fadePrevious:{value:panel.index===0?0:1},fadeNext:{value:panel.index===PANELS.length-1?0:1},
        panelStart:{value:panel.start},panelLength:{value:panel.length},focusS:{value:0},visibleRadius:{value:40}},
      vertexShader:`varying vec2 artworkUV;void main(){artworkUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`
        uniform sampler2D art,mask,previous,next;
        uniform float previousShift,nextShift,fadePrevious,fadeNext,panelStart,panelLength,focusS,visibleRadius;
        varying vec2 artworkUV;
        void main(){
          vec2 uv=artworkUV;
          vec4 color=texture2D(art,uv);
          float black=min(texture2D(mask,uv).r,min(texture2D(mask,uv+vec2(0.,.01)).r,texture2D(mask,uv-vec2(0.,.01)).r));
          float blend=smoothstep(.15,.7,black);
          color=mix(color,texture2D(previous,vec2(1.-uv.x,uv.y+previousShift)),.5*(1.-smoothstep(0.,.065,uv.x))*blend*fadePrevious);
          color=mix(color,texture2D(next,vec2(1.-uv.x,uv.y+nextShift)),.5*smoothstep(.935,1.,uv.x)*blend*fadeNext);
          color.a*=smoothstep(0.,.025,uv.y)*(1.-smoothstep(.97,1.,uv.y));
          color.a*=1.-smoothstep(visibleRadius-2.,visibleRadius,abs(panelStart+uv.x*panelLength-focusS));
          if(color.a<.005)discard;
          gl_FragColor=color;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side:THREE.DoubleSide,transparent:true,depthWrite:false,
    });
    const mesh=new THREE.Mesh(geometry,material);
    scene.add(mesh);meshes.push({mesh,panel});
  }
  const colors=[new THREE.Color('#9bb3a1'),new THREE.Color('#83bce9')];
  return (progress,viewWidth,viewHeight,edgeFraming=0)=>{
    const s=progress*WORLD.totalLength;
    const center=s+edgeFraming,visibleRadius=Math.max(viewWidth/2,viewHeight*.3)+3;
    // Nearby panels stay visible; distant turns cannot cover the active scene.
    for(const {mesh,panel} of meshes) {
      const distance=Math.abs(panel.start+panel.length/2-s);
      mesh.visible=panel.start+panel.length>=center-visibleRadius && panel.start<=center+visibleRadius;
      mesh.renderOrder=100-Math.floor(distance);
      mesh.material.uniforms.focusS.value=center;
      mesh.material.uniforms.visibleRadius.value=visibleRadius;
    }
    const scenePosition=s/SCENE_LENGTH,index=Math.min(5,Math.floor(scenePosition));
    const t=THREE.MathUtils.smoothstep(scenePosition-index,.88,1);
    scene.background.copy(colors[index%2]).lerp(colors[Math.min(5,index+1)%2],t);
  };
}
