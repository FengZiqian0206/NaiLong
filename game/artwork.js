import * as THREE from '../vendor/three.module.min.js';
import {WORLD} from './world.js?v=20261123b';
import {PANELS,TRANSITIONS,LEVEL3_ENTRY_RAMP,sceneAt,transitionAt,transitionTop,worldAt} from './scenes.js?v=20261127e';

// Arc-length overlaps. A longer dissolve in matching scenery softens the join
// without having to stretch the transition or repeat its landmarks.
const edgeBlends=[[1.2,1.2],[1.2,1.65],[4.1,1.2],[3.0,2.45],[4.0,1.2],[0,0]];
const staggeredPanels=new Set([2,3,4,5]);
// Keep the illustrated curbs/steps through the first few columns of their destination.
const panelLead=[0,0,1.65,2.6,.4,0];
// Pixel landmarks measured in the transition plate and its neighboring level.
// Keep these local registrations through the blend so each prop appears once.
const registrations=[
  [{x:605.5,y:605,levelY:552,sx:1.099,sy:1.100},
   {x:1916.5,y:593.5,levelY:542,sx:1.094,sy:1.094}],
  [{x:491.5,y:596,levelY:542,sx:1.110,sy:1.107},
   {x:1919.5,y:582.5,levelY:532,sx:1.096,sy:1.094}],
  [{x:523,y:580,levelY:532,sx:1.093,sy:1.095},
   {x:1855,y:676,levelY:621.5,sx:1.097,sy:1.093}],
  [{x:574,y:679,levelY:621.5,sx:1.098,sy:1.097},
   {x:1804,y:605,levelY:551,sx:1.097,sy:1.097}],
  [{x:526,y:547,levelY:552,sx:1.028,sy:1.009},
   {x:1658,y:555,levelY:548,sx:1.027,sy:1.008}],
];
// Pixel rows along the actual path through the new illustrations. Leaving the
// stairs on the back of the 5–6 crossing in the art keeps the front rim walkable.
const roadProfiles={
  2:[[605,574],[760,573],[1660,575],[1750,589],[1805,615]],
  3:[[706,666],[1424,666],[1538,652],[1665,644],[1740,626]],
  4:[[640,547],[735,548.5],[865,549.5],[1060,553],[1300,555],[1560,555]],
};
// Lift the distant scenery only across broad spans. The low foreground can
// still follow the walking surface, including the approach to the red stairs.
const sceneryProfiles={
  2:[[740,574],[1510,575]],
  3:[[770,666],[1370,666]],
};
function rowAlongRoad(anchors,x) {
  if(x<=anchors[0][0]) return anchors[0][1];
  for(let i=1;i<anchors.length;i++) {
    const [right,row]=anchors[i];
    if(x>right) continue;
    const [left,previous]=anchors[i-1];
    return THREE.MathUtils.lerp(previous,row,THREE.MathUtils.smoothstep(x,left,right));
  }
  return anchors.at(-1)[1];
}
const edgePaint=`
  vec4 continuedPaint(sampler2D art,vec2 uv,float outdoor,float garden){
    float outside=max(-uv.y,uv.y-1.);
    vec4 paint=texture2D(art,uv);
    if(outside>0.){
      float inset=.09*(1.-exp(-outside/.09));
      vec2 point=vec2(uv.x,uv.y>1.?1.-inset:inset);
      vec2 blur=vec2(.075*smoothstep(.025,.28,outside),0.);
      paint=(3.*texture2D(art,point)+2.*texture2D(art,point+blur)+
        2.*texture2D(art,point-blur)+texture2D(art,point+2.*blur)+texture2D(art,point-2.*blur))/9.;
      // Dissolve the reflected edge into the room/sky colors before the
      // extended area becomes large enough to look like stretched paint.
      vec3 ceiling=mix(vec3(.115,.105,.114),vec3(.12,.24,.235),outdoor);
      vec3 foundation=mix(vec3(.031,.047,.056),vec3(.026,.047,.085),outdoor);
      ceiling=mix(ceiling,mix(vec3(.27,.23,.38),vec3(.27,.47,.49),outdoor),garden);
      foundation=mix(foundation,vec3(.044,.057,.13),garden);
      vec3 distant=uv.y>1.?ceiling:foundation;
      paint.rgb=mix(paint.rgb,distant,smoothstep(.045,.34,outside));
    }
    return paint;
  }`;
const transitionPaint=`
  uniform sampler2D art;
  uniform float overscan,garden,transitionIndex;
  uniform vec2 paintedEdges,imageSize;
  uniform float rampStartsAt;
  ${edgePaint}

  float window(float p,float left,float right,float feather){
    return smoothstep(left-feather,left,p)*(1.-smoothstep(right,right+feather,p));
  }

  vec3 fairgroundApproach(vec3 paint,vec2 uv,float x,float relative,float worldHeight){
    float apron=window(relative,rampStartsAt,1.48,1.25);
    if(apron<=0.) return paint;
    float nativeRow=mix(598.,579.5,clamp((x-1927.5)/25.5,0.,1.));
    float newRow=(1.-artworkWarp.y)*imageSize.y;
    float difference=abs(nativeRow-newRow);
    float row=(1.-uv.y)*imageSize.y;
    float nativeDepth=row-nativeRow;
    float depth=-worldHeight*imageSize.y/artworkWarp.w;

    // Only replace the displaced curb. Preserve the scene above it and use
    // the original stone, including the same painted joints, on the new grade.
    float correction=smoothstep(.35,1.5,difference);
    float oldCurb=window(nativeDepth,-1.,15.,2.9);
    float wallRow=nativeRow-6.-max(0.,nativeDepth)*.26;
    vec3 wall=texture2D(art,vec2(uv.x,1.-wallRow/imageSize.y)).rgb;
    float baseRow=nativeRow+19.+max(0.,nativeDepth)*.43;
    vec3 base=texture2D(art,vec2(uv.x,1.-baseRow/imageSize.y)).rgb;
    float covered=smoothstep(-1.,.55,depth);
    vec3 cleared=mix(paint,mix(wall,base,covered),oldCurb);
    vec3 stone=texture2D(art,vec2(uv.x,1.-(nativeRow+depth)/imageSize.y)).rgb;
    float front=covered*(1.-smoothstep(15.,24.,depth));
    vec3 paving=mix(paint,mix(cleared,stone,front),correction);

    float lantern=smoothstep(1590.,1900.,x)*(1.-smoothstep(1915.,1954.,x));
    paving*=mix(vec3(1.),vec3(.93,.72,.73),lantern*front*.63);
    return mix(paint,paving,apron);
  }

  vec3 factoryApproach(vec3 paint,vec2 uv,float x,float worldHeight){
    float row=(1.-uv.y)*imageSize.y;
    // Replace the hanging treads with the dark masonry around them.
    float erase=max(window(x,1736.,1793.,9.)*window(row,569.,582.,5.),
      window(x,1780.,1856.,7.)*window(row,605.,624.,5.));
    vec3 wall=texture2D(art,uv+vec2(0.,24./imageSize.y)).rgb;
    paint=mix(paint,wall,erase);
    float lowerTread=window(x,1823.,1897.,7.)*window(row,639.,657.,5.);
    float masonryRow=mix(627.,632.,smoothstep(634.,662.,row));
    vec3 masonry=texture2D(art,vec2(uv.x,1.-masonryRow/imageSize.y)).rgb;
    paint=mix(paint,masonry,lowerTread);

    // Carry the painted bank and the factory's rough slab through the join.
    // The fence shadow dims reflections at the center of the new footing.
    float depth=-worldHeight*imageSize.y/artworkWarp.w;
    float bankX=1710.+(x-1740.)*.29;
    float slabX=1918.+max(0.,x-1805.)*.45;
    float irregularity=.57*sin(.23*x)+.38*sin(.61*x);
    float bankRow=573.+depth+irregularity;
    float slabRow=677.+depth+irregularity;
    vec3 bank=texture2D(art,vec2(bankX/imageSize.x,1.-bankRow/imageSize.y)).rgb;
    vec3 slab=texture2D(art,vec2(slabX/imageSize.x,1.-slabRow/imageSize.y)).rgb;
    float landing=smoothstep(1835.,1940.,x);
    vec3 path=mix(bank,slab,landing);
    float gateShadow=window(x,1790.,1874.,54.)*(1.-smoothstep(8.,104.,depth));
    path*=mix(vec3(1.),vec3(.23,.54,.66),gateShadow);
    float footprint=window(x,1733.,1925.,47.)*smoothstep(-1.6,2.8,depth);
    return mix(paint,path,footprint);
  }

  vec3 porchPaving(vec3 paint,vec2 uv,float x){
    float depth=(1.-uv.y)*imageSize.y-603.;
    float shade=window(x,1490.,1775.,225.);
    float stone=window(depth,-1.,8.5,4.);
    float face=window(depth,8.,31.,9.);
    float light=dot(paint,vec3(.2126,.7152,.0722));
    paint=mix(paint,paint*vec3(.76,.81,.87),shade*stone*smoothstep(.22,.77,light));
    return mix(paint,paint*vec3(1.12,1.1,1.07),shade*face);
  }

  vec3 stationApproach(vec3 paint,vec2 uv,float x){
    float row=(1.-uv.y)*imageSize.y;
    float roadRow=547.+3.*smoothstep(640.,865.,x);
    float stationLight=window(x,485.,572.,300.);
    float curb=window(row-roadRow,-1.8,8.6,4.);
    float warmth=smoothstep(-.045,.33,paint.r-paint.b);
    float grain=dot(paint,vec3(.2126,.7152,.0722));
    // Give both sides of the rim the same light at the junction, then let
    // the garden light return along the original cracks and stonework.
    vec3 coolStone=vec3(.25,1.12,1.44)*grain*mix(1.,1.15,warmth);
    paint=mix(paint,coolStone,stationLight*curb);
    float railing=stationLight*window(row,485.,544.,7.);
    return mix(paint,paint*vec3(.69,.99,1.15),railing*warmth*.48);
  }

  vec4 paint(vec2 uv){
    uv.y=uv.y*(1.+2.*overscan)-overscan;
    float x=uv.x*imageSize.x;
    float relative=artworkWarp.z;
    float worldHeight=(uv.y-artworkWarp.y)*artworkWarp.w;
    uv.y+=artworkWarp.x*(1.-smoothstep(.045,.25,abs(uv.y-artworkWarp.y)));
    vec4 color=continuedPaint(art,uv,1.,garden);
    if(transitionIndex==0.) color.rgb=porchPaving(color.rgb,uv,x);
    if(transitionIndex==1.) color.rgb=fairgroundApproach(color.rgb,uv,x,relative,worldHeight);
    if(transitionIndex==2.) color.rgb=factoryApproach(color.rgb,uv,x,worldHeight);
    // The neighboring paintings use different exposure even at landmarks
    // they share. Match the common colors near each edge before the dissolve.
    float left=1.-smoothstep(paintedEdges.x,paintedEdges.x+.075,uv.x);
    float right=smoothstep(paintedEdges.y-.075,paintedEdges.y,uv.x);
    if(transitionIndex==3.){
      float redSky=smoothstep(.16,.65,color.r);
      vec3 redGrade=max(color.rgb+redSky*vec3(.08,-.029,-.013),0.);
      color.rgb=mix(color.rgb,redGrade,left);
      float blueWall=smoothstep(.015,.065,color.b-color.r);
      color.rgb*=mix(vec3(1.),vec3(.55,1.04,1.04),right*blueWall);
    }
    if(transitionIndex==4.){
      vec3 wallGrade=color.rgb*vec3(1.,.62,.62)+vec3(.004,0.,0.);
      vec3 skyGrade=color.rgb+vec3(.012,.027,.024);
      color.rgb=mix(color.rgb,mix(wallGrade,skyGrade,smoothstep(.51,.79,uv.y)),left);
      color.rgb*=mix(vec3(1.),vec3(.82,1.07,.85),right);
      color.rgb=stationApproach(color.rgb,uv,x);
    }
    float band=smoothstep(0.,.07,uv.y)*(1.-smoothstep(.97,1.,uv.y));
    color.a*=mix(band,1.,step(.001,overscan)*(1.-smoothstep(.73,.80,uv.x)));
    return color;
  }`;

export async function addArtwork(scene) {
  const loader=new THREE.TextureLoader();
  async function loadTexture(filename,isColor=true) {
    const texture=await loader.loadAsync(new URL('./assets/'+filename,import.meta.url).href);
    if(isColor) texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  const maskedScenes=new Set([0,1]);
  const [maps,bridges]=await Promise.all([
    Promise.all(PANELS.map(async panel=>{
      if(!panel.image) return null;
      const [art,mask]=await Promise.all([
        loadTexture(panel.index===0?'home/level1-clean.png?v=20261125':panel.image),
        maskedScenes.has(panel.index)?loadTexture('level'+(panel.index+1)+'_mask.jpg',false):null,
      ]);
      return {art,mask};
    })),
    Promise.all(TRANSITIONS.map(transition=>transition.image?loadTexture(transition.image):null)),
  ]);
  const meshes=[];
  function meshStrip(start,end,column,uniforms,fragment,renderOrder=0) {
    const vertices=[],uv=[],warp=[],indices=[];
    const columns=Math.ceil((end-start)/.25);
    for(let i=0;i<=columns;i++) {
      const t=i/columns,s=start+(end-start)*t;
      const [bottom,top,u=t,shift=0,floor=0,relative=0,height=1]=column(s);
      const low=worldAt(s,bottom),high=worldAt(s,top);
      vertices.push(low.x,low.y,-2,high.x,high.y,-2);
      uv.push(u,0,u,1);
      warp.push(shift,floor,relative,height,shift,floor,relative,height);
      if(i<columns) indices.push(i*2,i*2+2,i*2+1,i*2+1,i*2+2,i*2+3);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('paintWarp',new THREE.Float32BufferAttribute(warp,4));
    geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({
      uniforms,
      vertexShader:`attribute vec4 paintWarp;
        varying vec2 artworkUV;
        varying vec4 artworkWarp;
        void main(){artworkUV=uv;artworkWarp=paintWarp;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 artworkUV;
        varying vec4 artworkWarp;
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
    meshStrip(start,end,s=>{
      const top=floor(s);
      return [top-.3,top];
    },{},`
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
    const artHeight=source.height*pixelScale;
    // An edge-framed view looks farther across the curved room than a centered
    // view. Continue its ceiling and foundation outside the painted strip.
    const endpoint=index===0||index===PANELS.length-1;
    const above=endpoint?62:0,below=endpoint?36:0;
    meshStrip(start,end,()=>[(baseline-source.height)*pixelScale-below,baseline*pixelScale+above],{
      art:{value:map.art},
      mask:{value:map.mask??map.art},
      hasMask:{value:Number(Boolean(map.mask))},
      sourceBand:{value:new THREE.Vector2(1+(above+below)/artHeight,-below/artHeight)},
      fadeIn:{value:edgeBlends[previous.index][1]/length},
      fadeDelay:{value:panelLead[index]/length},
      fadeOut:{value:edgeBlends[next.index][0]/length},
      stagger:{value:Number(staggeredPanels.has(index))},
      floorUV:{value:1-baseline/source.height},
      stationDeparture:{value:Number(index===4)},
      garden:{value:Number(index===PANELS.length-1)},
    },`
      uniform sampler2D art,mask;
      uniform float hasMask,fadeIn,fadeDelay,fadeOut,stagger,floorUV,stationDeparture,garden;
      uniform vec2 sourceBand;
      ${edgePaint}
      vec4 paint(vec2 uv){
        uv.y=uv.y*sourceBand.x+sourceBand.y;
        vec4 color=continuedPaint(art,uv,smoothstep(.46,.81,uv.x),garden);
        // Offset the dissolve slightly with height so it doesn't read as a
        // vertical stripe on textured trunks or flat painted masonry.
        float row=clamp(uv.y,0.,1.);
        float weave=.33*(row-.45)+.09*sin(row*14.);
        float incomingWidth=fadeIn*(1.+stagger*weave);
        float outgoingWidth=fadeOut*(1.-stagger*weave);
        float incoming=fadeIn>0.?smoothstep(fadeDelay,fadeDelay+incomingWidth,uv.x):1.;
        float outgoing=fadeOut>0.?smoothstep(0.,outgoingWidth,1.-uv.x):1.;
        if(stationDeparture>.5){
          // Let the aligned path plate own the near side of the join, so
          // two versions of the same pavement edge never remain visible.
          float pavement=1.-smoothstep(.013,.052,abs(row-floorUV));
          float pathFade=smoothstep(fadeOut*.3,fadeOut*1.23,1.-uv.x);
          outgoing=mix(outgoing,pathFade,pavement);
        }
        float edgeFade=incoming*outgoing;
        float black=min(texture2D(mask,uv).r,
          min(texture2D(mask,uv+vec2(0.,.004)).r,texture2D(mask,uv-vec2(0.,.004)).r));
        // Raised platforms retain their visible contact surfaces; the two
        // pavement layers blend together across the seam.
        float elevated=smoothstep(.019,.035,uv.y-floorUV);
        float keep=elevated*hasMask*(1.-smoothstep(.15,.7,black));
        color.a*=mix(edgeFade,1.,keep);
        float band=smoothstep(0.,.03,uv.y)*(1.-smoothstep(.98,1.,uv.y));
        float overscan=step(1.001,sourceBand.x);
        color.a*=mix(band,1.,overscan);
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
    const [entry,exit]=registrations[index];
    const before=PANELS[index],after=PANELS[index+1];
    const {pixelScale}=before;
    const {width,height}=bridges[index].image;
    const {length,exitTop,entryTop}=transition;
    const startRow=entry.y+entry.sy*(before.baseline-exitTop/pixelScale-entry.levelY);
    const endRow=exit.y+exit.sy*(after.baseline-entryTop/after.pixelScale-exit.levelY);
    const leftRate=entry.sx/pixelScale,rightRate=exit.sx/after.pixelScale;
    const averageRate=(exit.x-entry.x)/length;
    const extra=panelLead[index+1];
    const overscan=index===0?1.65:0;
    const road=roadProfiles[index]&&[[entry.x,startRow],...roadProfiles[index],[exit.x,endRow]];
    const scenery=sceneryProfiles[index]&&[[entry.x,startRow],...sceneryProfiles[index],[exit.x,endRow]];
    const [leftBlend,rightBlend]=edgeBlends[index];
    meshStrip(start-leftBlend*1.28,end+extra+rightBlend*1.28,s=>{
      const t=THREE.MathUtils.clamp((s-start)/length,0,1);
      // Preserve the scale at each join and distribute the width adjustment
      // through the unique middle of the plate.
      let sourceX=THREE.MathUtils.lerp(entry.x,exit.x,t)+length*t*(1-t)*
        ((1-t)*(leftRate-averageRate)-t*(rightRate-averageRate));
      if(s<start) sourceX=entry.x+(s-start)*leftRate;
      if(s>end) sourceX=exit.x+(s-end)*rightRate;
      const verticalScale=THREE.MathUtils.lerp(pixelScale/entry.sy,after.pixelScale/exit.sy,t);
      const middleRow=index===0?THREE.MathUtils.lerp(607,601,t):598;
      const roadIn=THREE.MathUtils.lerp(startRow,middleRow,THREE.MathUtils.smoothstep(s,start,start+5));
      let roadRow;
      if(road) {
        roadRow=rowAlongRoad(road,sourceX);
      } else if(index===1) {
        // Match the school curb along the grade, then register the arch
        // gently against its matching painting at the end of the bridge.
        roadRow=THREE.MathUtils.lerp(roadIn,endRow,THREE.MathUtils.smoothstep(s,end-12,end));
      } else {
        roadRow=THREE.MathUtils.lerp(roadIn,endRow,THREE.MathUtils.smoothstep(s,end-5,end));
      }
      const artHeight=height*verticalScale;
      const trackHeight=top(s);
      const broadT=THREE.MathUtils.smoothstep(sourceX,scenery?.at(-2)[0]??entry.x,exit.x);
      const sceneryHeight=THREE.MathUtils.lerp(exitTop,entryTop,broadT);
      const sceneryRow=scenery?rowAlongRoad(scenery,sourceX):roadRow;
      const ceiling=(scenery?sceneryHeight:trackHeight)+sceneryRow*verticalScale;
      const roadShift=(ceiling-trackHeight-roadRow*verticalScale)/artHeight;
      const safeShift=THREE.MathUtils.clamp(roadShift,-.085,.085);
      const floor=1+(trackHeight-ceiling)/artHeight;
      return [ceiling-(1+overscan)*artHeight,ceiling+overscan*artHeight,sourceX/width,safeShift,floor,s-end,artHeight];
    },{
      art:{value:bridges[index]},
      overscan:{value:overscan},
      garden:{value:Number(index===4)},
      transitionIndex:{value:index},
      imageSize:{value:new THREE.Vector2(width,height)},
      rampStartsAt:{value:-LEVEL3_ENTRY_RAMP.length-LEVEL3_ENTRY_RAMP.endBefore},
      paintedEdges:{value:new THREE.Vector2(entry.x/width,exit.x/width)},
    },transitionPaint,-2);
  }

  const colors=['#9bb3a1','#83bce9','#302238','#0b2231','#163e53','#51486e'].map(color=>new THREE.Color(color));
  return (progress,width,height,viewProgress=progress)=>{
    const s=progress*WORLD.totalLength, viewS=viewProgress*WORLD.totalLength;
    const visibleRadius=Math.max(width*.65,height*.55)+10;
    for(const {mesh,center,length} of meshes) {
      const delta=Math.abs(center-viewS);
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
