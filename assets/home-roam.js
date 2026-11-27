/* Ambient robot illustration. Choreographed sensing, not a research simulation. */
(() => {
  const canvas = document.getElementById("swarm-roam");
  const button = document.getElementById("roam-toggle");
  if (!canvas || !button) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
  const playIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
  let width=0, height=0, obstacles=[], robots=[], colors={}, paused=false, raf=0, previous=0, clock=0, dirty=true, lastLayout=0;
  const random=(a,b)=>a+Math.random()*(b-a);
  function palette() {
    const s=getComputedStyle(document.documentElement);
    colors={teal:s.getPropertyValue("--scout").trim(),amber:s.getPropertyValue("--worker").trim(),ink:s.getPropertyValue("--ink").trim(),surface:s.getPropertyValue("--surface").trim()};
  }
  function resize() {
    width=innerWidth; height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*ratio); canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    robots=[]; dirty=true; palette();
  }
  function collectObstacles() {
    const boxes=[];
    const add=rect=>{
      if(rect.width<1||rect.height<1||rect.bottom<0||rect.top>height||rect.right<0||rect.left>width)return;
      boxes.push({left:rect.left-10,top:rect.top-10,right:rect.right+10,bottom:rect.bottom+10});
    };
    // Protect actual text lines, not whole sections, so robots can use the gaps.
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      if(!node.textContent.trim())continue;
      const parent=node.parentElement;
      if(!parent||parent.closest("script,style,svg,canvas,[hidden],dialog:not([open])"))continue;
      const r=document.createRange();r.selectNodeContents(node);
      for(const rect of r.getClientRects())add(rect);
    }
    document.querySelectorAll("nav,img,button,input,select,textarea,video,iframe,canvas:not(#swarm-roam)").forEach(el=>add(el.getBoundingClientRect()));
    obstacles=boxes;
    dirty=false;
  }
  function free(x,y,padding=0) {
    if(x<14+padding||y<14+padding||x>width-14-padding||y>height-14-padding)return false;
    return !obstacles.some(r=>x>r.left-padding&&x<r.right+padding&&y>r.top-padding&&y<r.bottom+padding);
  }
  function place() {
    for(let tries=0;tries<180;tries++){
      const x=random(16,width-16),y=random(84,height-16);
      if(free(x,y,5)&&robots.every(r=>Math.hypot(r.x-x,r.y-y)>45))
        return {x,y,angle:random(-Math.PI,Math.PI),speed:random(15,24),phase:random(0,10),turn:random(-.25,.25),trail:[],stamp:0};
    }
    return null;
  }
  function clearAhead(r,angle,distance) {
    return free(r.x+Math.cos(angle)*distance,r.y+Math.sin(angle)*distance,3);
  }
  function advance(r,dt) {
    if(!free(r.x,r.y,2)){
      const spot=place();
      if(spot)Object.assign(r,spot);
      return;
    }
    r.angle+=Math.sin(clock*.45+r.phase)*.18*dt;
    if(!clearAhead(r,r.angle,30)) {
      const turns=[.55,-.55,1.1,-1.1,1.8,-1.8,Math.PI];
      const turn=turns.find(t=>clearAhead(r,r.angle+t,26)&&clearAhead(r,r.angle+t,12));
      r.angle+=turn===undefined?Math.PI:turn;
    }
    for(const other of robots)if(other!==r&&Math.hypot(other.x-r.x,other.y-r.y)<24)r.angle+=1.4*dt;
    const x=r.x+Math.cos(r.angle)*r.speed*dt,y=r.y+Math.sin(r.angle)*r.speed*dt;
    if(free(x,y,2)){r.x=x;r.y=y;}else r.angle+=Math.PI*.7;
    if(clock-r.stamp>.2){r.trail.push([r.x,r.y]);if(r.trail.length>9)r.trail.shift();r.stamp=clock;}
  }
  function drawRobot(r,index) {
    const color=index%2?colors.amber:colors.teal;
    if(!free(r.x,r.y))return;
    ctx.save();ctx.translate(r.x,r.y);
    const scan=(clock+r.phase)%10;
    if(scan<1.9){
      let reach=64;
      for(let d=12;d<=64;d+=8){
        if([-.42,0,.42].some(a=>!free(r.x+Math.cos(r.angle+a)*d,r.y+Math.sin(r.angle+a)*d,1))){reach=d-4;break;}
      }
      if(reach>16){
        ctx.save();ctx.rotate(r.angle);
        const glow=ctx.createRadialGradient(0,0,4,0,0,reach);
        glow.addColorStop(0,color);glow.addColorStop(1,"transparent");
        ctx.globalAlpha=.16*Math.sin(Math.PI*scan/1.9);
        ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,reach,-.42,.42);ctx.closePath();ctx.fill();
        ctx.strokeStyle=color;ctx.lineWidth=.6;ctx.globalAlpha=.25;
        ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(reach*.85,0);ctx.stroke();ctx.restore();
      }
    }
    ctx.rotate(r.angle);
    ctx.fillStyle=colors.ink;
    ctx.fillRect(-4,-8,8,3);ctx.fillRect(-4,5,8,3);
    ctx.fillStyle=colors.surface;ctx.strokeStyle=color;ctx.lineWidth=1.8;
    ctx.beginPath();ctx.arc(0,0,6.4,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(-1,0,2.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(3,-2.3);ctx.lineTo(6.5,0);ctx.lineTo(3,2.3);ctx.closePath();ctx.fill();
    ctx.restore();
    ctx.fillStyle=color;
    r.trail.forEach(([x,y],i)=>{if(free(x,y)){ctx.globalAlpha=.04+.12*i/r.trail.length;ctx.beginPath();ctx.arc(x,y,.8,0,Math.PI*2);ctx.fill();}});
    ctx.globalAlpha=1;
  }
  function frame(now) {
    raf=0;
    if(paused||reduce.matches||document.hidden)return;
    if(previous&&now-previous<32){raf=requestAnimationFrame(frame);return;}
    const dt=Math.min((now-(previous||now))/1000,.05);previous=now;clock+=dt;
    if(dirty&&now-lastLayout>90){collectObstacles();lastLayout=now;}
    const target=width<650?2:4;
    while(robots.length<target){const r=place();if(!r)break;robots.push(r);}
    if(robots.length>target)robots.length=target;
    ctx.clearRect(0,0,width,height);
    robots.forEach(r=>advance(r,dt));
    robots.forEach(drawRobot);
    raf=requestAnimationFrame(frame);
  }
  function sync() {
    const running=!paused&&!reduce.matches&&!document.hidden;
    canvas.dataset.state=reduce.matches?"reduced":running?"running":"paused";
    button.hidden=reduce.matches;
    button.innerHTML=paused?playIcon:pauseIcon;
    button.setAttribute("aria-label",paused?"Resume background robots":"Pause background robots");
    button.title=paused?"Resume background robots":"Pause background robots";
    cancelAnimationFrame(raf);raf=0;previous=0;
    if(reduce.matches)ctx.clearRect(0,0,width,height);
    if(running)raf=requestAnimationFrame(frame);
  }
  button.addEventListener("click",()=>{paused=!paused;sync();});
  addEventListener("resize",resize);
  addEventListener("scroll",()=>{dirty=true;},{passive:true});
  addEventListener("load",()=>{dirty=true;});
  document.addEventListener("visibilitychange",sync);
  reduce.addEventListener("change",sync);
  new MutationObserver(()=>{palette();dirty=true;}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  if("ResizeObserver" in window)new ResizeObserver(()=>{dirty=true;}).observe(document.body);
  resize();sync();
})();
