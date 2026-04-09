'use strict';
(function() {
    const $ = s => document.querySelector(s);
    
    // UI Elements
    const statusTxt = $('#statusTxt');
    const missionTime = $('#missionTime');
    const tAlt = $('#t-alt');
    const tVel = $('#t-vel');
    const tFuel = $('#t-fuel');
    const tThr = $('#t-thr');
    const tStg = $('#t-stg');
    const sysTitle = $('#sysTitle');
    const sysStats = $('#sysStats');
    const launchBtn = $('#launchBtn');
    const abortBtn = $('#abortBtn');
    const camBtns = document.querySelectorAll('.sys-btn');

    let missionState = 'PLANNING'; // PLANNING, COUNTDOWN, LAUNCH, ASCENT, TRAVEL, ARRIVAL, LANDING, LANDED
    let targetObj = null;
    let clock = new THREE.Clock();
    let timeElapsed = 0;
    
    // Audio Context (Synthesized sounds)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioContext();
    let engineSound;
    
    // Three.js Core
    const canvas = $('#spaceCanvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    const w = window.innerWidth;
    const h = window.innerHeight - 60; // nav height approx
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.FogExp2(0x000000, 0.0003);
    
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 20000);
    // Explicit initial lookAt for safety
    camera.position.set(0, 50, 200);
    
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 15000;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x222233, 0.5);
    scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xfff5e6, 3, 10000);
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    // Dynamic Starfield
    const starsGeo = new THREE.BufferGeometry();
    const starsPos = [];
    for(let i=0; i<8000; i++) {
        const x = (Math.random()-0.5)*15000;
        const y = (Math.random()-0.5)*15000;
        const z = (Math.random()-0.5)*15000;
        if(Math.sqrt(x*x+y*y+z*z) > 1000) {
            starsPos.push(x, y, z);
        }
    }
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starsPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, transparent:true, opacity: 0.8, sizeAttenuation: true });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // Procedural Asteroid Belt
    const astGeo = new THREE.BufferGeometry();
    const astPos = [];
    const astColors = [];
    const c = new THREE.Color();
    for(let i=0; i<3000; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 600 + (Math.random()-0.5)*100;
        astPos.push(Math.cos(angle)*dist, (Math.random()-0.5)*20, Math.sin(angle)*dist);
        c.setHSL(0, 0, Math.random()*0.3 + 0.2);
        astColors.push(c.r, c.g, c.b);
    }
    astGeo.setAttribute('position', new THREE.Float32BufferAttribute(astPos, 3));
    astGeo.setAttribute('color', new THREE.Float32BufferAttribute(astColors, 3));
    const astMat = new THREE.PointsMaterial({ size: 1.5, vertexColors: true, sizeAttenuation: true });
    const asteroidBelt = new THREE.Points(astGeo, astMat);
    scene.add(asteroidBelt);

    // Planets Setup
    const SOLAR_DATA = [
        { name: 'Earth', color: 0x3b82f6, radius: 12, dist: 150, period: 365, stats: { Type: 'Planet', Gravity: '9.8 m/s²', Atmosphere: 'Oxygen/Nitrogen' }, atmoColor: 0x60a5fa, speed: 0.1 },
        { name: 'Moon', color: 0xd1d5db, radius: 3.5, dist: 30, parent: 'Earth', period: 27, stats: { Type: 'Moon', Gravity: '1.6 m/s²', Atmosphere: 'None' }, speed: 0.8 },
        { name: 'Mars', color: 0xef4444, radius: 6.3, dist: 250, period: 687, stats: { Type: 'Planet', Gravity: '3.7 m/s²', Atmosphere: 'Thin CO2' }, atmoColor: 0xfca5a5, speed: 0.08 },
        { name: 'Phobos', color: 0x9ca3af, radius: 1, dist: 12, parent: 'Mars', period: 5, stats: { Type: 'Moon' }, speed: 1.2 },
        { name: 'Jupiter', color: 0xf59e0b, radius: 35, dist: 900, period: 4332, stats: { Type: 'Gas Giant', Gravity: '24.7 m/s²', Atmosphere: 'Dense H/He' }, atmoColor: 0xfde68a, speed: 0.02 },
        { name: 'Europa', color: 0xe5e7eb, radius: 3, dist: 60, parent: 'Jupiter', period: 85, stats: { Type: 'Moon' }, speed: 0.4 },
        { name: 'Saturn', color: 0xfde68a, radius: 28, dist: 1400, period: 10759, stats: { Type: 'Gas Giant', Gravity: '10.4 m/s²', Atmosphere: 'Dense H/He' }, hasRings: true, speed: 0.015 }
    ];
    
    const celestialBodies = {};
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // The Sun
    const sunGeo = new THREE.SphereGeometry(60, 64, 64);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.userData = { name: 'Sun' };
    scene.add(sunMesh);
    celestialBodies['Sun'] = sunMesh;
    
    // Sun Glow
    const sunGlowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.15, side: THREE.BackSide, blending: THREE.AdditiveBlending });
    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 32), sunGlowMat);
    scene.add(sunGlow);

    const textureLoader = new THREE.TextureLoader();

    SOLAR_DATA.forEach(pd => {
        const geo = new THREE.SphereGeometry(pd.radius, 64, 64);
        const mat = new THREE.MeshStandardMaterial({ 
            color: pd.color, 
            roughness: pd.Type === 'Gas Giant' ? 0.2 : 0.8,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Atmosphere Glow effect
        if(pd.atmoColor) {
            const atmoMat = new THREE.MeshBasicMaterial({ color: pd.atmoColor, transparent: true, opacity: 0.2, side: THREE.BackSide, blending: THREE.AdditiveBlending });
            const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(pd.radius * 1.25, 32, 32), atmoMat);
            mesh.add(atmoMesh);
        }
        
        if(pd.hasRings) {
            const ringGeo = new THREE.RingGeometry(pd.radius*1.4, pd.radius*2.2, 64);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, side: THREE.DoubleSide, transparent:true, opacity:0.8 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI/2 - 0.2;
            ring.receiveShadow = true;
            ring.castShadow = true;
            mesh.add(ring);
        }

        // Orbit logic
        mesh.userData = { ...pd, angle: Math.random() * Math.PI * 2 };
        
        if(pd.parent) mesh.userData.orbitCenter = celestialBodies[pd.parent].position;
        else mesh.userData.orbitCenter = sunMesh.position;

        // Position it roughly
        mesh.position.set(
            Math.cos(mesh.userData.angle) * pd.dist,
            0,
            Math.sin(mesh.userData.angle) * pd.dist
        );

        // Orbit ring
        const orbitGeo = new THREE.RingGeometry(pd.dist-0.5, pd.dist+0.5, 128);
        const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: pd.parent ? 0.05 : 0.15, side: THREE.DoubleSide });
        const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
        orbitMesh.rotation.x = Math.PI/2;
        if(pd.parent) celestialBodies[pd.parent].add(orbitMesh);
        else scene.add(orbitMesh);

        scene.add(mesh);
        celestialBodies[pd.name] = mesh;
    });

    // Multi-Stage Rocket
    const rocketGroup = new THREE.Group();
    
    // Core Stage (will detach)
    const coreStage = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.2 });
    const bodyHitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 6, 32), bodyMat);
    bodyHitbox.position.y = 3;
    coreStage.add(bodyHitbox);
    
    // Fins
    const finMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    for(let i=0; i<4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 1.5), finMat);
        fin.position.y = 0.5;
        fin.position.x = Math.cos(i*Math.PI/2)*0.9;
        fin.position.z = Math.sin(i*Math.PI/2)*0.9;
        coreStage.add(fin);
    }
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 0.8, 16), new THREE.MeshStandardMaterial({color:0x111111}));
    nozzle.position.y = -0.4;
    coreStage.add(nozzle);
    rocketGroup.add(coreStage);

    // Second Stage (Command Module)
    const commandStage = new THREE.Group();
    commandStage.position.y = 6;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 32), new THREE.MeshStandardMaterial({color: 0x1f2937, metalness:0.3, roughness:0.2}));
    nose.position.y = 1;
    commandStage.add(nose);
    const upperNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 0.5, 16), new THREE.MeshStandardMaterial({color:0x222}));
    upperNozzle.position.y = -0.25;
    commandStage.add(upperNozzle);
    rocketGroup.add(commandStage);
    
    // Combine
    const rocket = rocketGroup;
    rocket.position.copy(celestialBodies['Earth'].position);
    rocket.position.y += celestialBodies['Earth'].geometry.parameters.radius + 0.5;
    rocket.scale.set(0.5, 0.5, 0.5); 
    scene.add(rocket);

    // High-performance Particle Engine for Exhaust & Explosions
    const pGeo = new THREE.BufferGeometry();
    const pCount = 1000;
    const posArr = new Float32Array(pCount * 3);
    const velArr = [];
    const lifeArr = new Float32Array(pCount);
    for(let i=0; i<pCount; i++) {
        posArr[i*3] = posArr[i*3+1] = posArr[i*3+2] = 10000;
        velArr.push(new THREE.Vector3());
        lifeArr[i] = 0;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    pGeo.setAttribute('life', new THREE.BufferAttribute(lifeArr, 1));
    
    const pMat = new THREE.ShaderMaterial({
        uniforms: { 
            uColorPrimary: { value: new THREE.Color(0xffaa00) },
            uColorSecondary: { value: new THREE.Color(0xff3300) }
        },
        vertexShader: `
            attribute float life;
            varying float vLife;
            void main() {
                vLife = life;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = (20.0 * life) * (50.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColorPrimary;
            uniform vec3 uColorSecondary;
            varying float vLife;
            void main() {
                if(vLife < 0.01) discard;
                float dist = length(gl_PointCoord - vec2(0.5));
                if(dist > 0.5) discard;
                vec3 finalColor = mix(uColorSecondary, uColorPrimary, vLife);
                gl_FragColor = vec4(finalColor, vLife * (1.0 - dist*2.0));
            }
        `,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Initial focus on Earth
    controls.target.copy(celestialBodies['Earth'].position);
    camera.position.set(
        celestialBodies['Earth'].position.x + 30, 
        celestialBodies['Earth'].position.y + 15, 
        celestialBodies['Earth'].position.z + 40
    );
    controls.update();

    // Interaction via raycaster
    renderer.domElement.addEventListener('click', e => {
        if(missionState !== 'PLANNING') return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        // Include ast belt for fun, but mainly target planets
        let intersects = raycaster.intersectObjects(Object.values(celestialBodies));
        if(intersects.length > 0) {
            const body = intersects[0].object;
            const name = Object.keys(celestialBodies).find(k => celestialBodies[k] === body);
            if(name !== 'Sun' && name !== 'Earth') {
                targetObj = body;
                sysTitle.textContent = name;
                sysStats.innerHTML = '';
                Object.entries(body.userData.stats || {}).forEach(([k,v]) => {
                    sysStats.innerHTML += `<div class="stat-item"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`;
                });
                launchBtn.disabled = false;
                
                playBeep();
                gsap.to(camera.position, {
                    x: body.position.x + body.geometry.parameters.radius*3.5,
                    y: body.position.y + body.geometry.parameters.radius*1.5,
                    z: body.position.z + body.geometry.parameters.radius*3.5,
                    duration: 1.5,
                    ease: "power2.inOut"
                });
                gsap.to(controls.target, {
                    x: body.position.x, y: body.position.y, z: body.position.z, duration: 1.5
                });
            }
        }
    });

    // Audio synth functions
    function playBeep() {
        if(actx.state === 'suspended') actx.resume();
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.connect(gain); gain.connect(actx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, actx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, actx.currentTime+0.1);
        gain.gain.setValueAtTime(0.1, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime+0.1);
        osc.start(); osc.stop(actx.currentTime+0.1);
    }
    
    function startEngineSound() {
        if(actx.state === 'suspended') actx.resume();
        const bufferSize = actx.sampleRate * 2;
        const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
        const data = buffer.getChannelData(0);
        for(let i=0; i<bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = actx.createBufferSource();
        noise.buffer = buffer; noise.loop = true;
        
        const filter = actx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 400;
        
        const gain = actx.createGain();
        gain.gain.value = 0.5;
        
        noise.connect(filter); filter.connect(gain); gain.connect(actx.destination);
        noise.start();
        engineSound = { source: noise, gain: gain, filter: filter };
    }
    
    function stopEngineSound() {
        if(engineSound && engineSound.gain.gain) {
            engineSound.gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime+1.5);
            setTimeout(() => { if(engineSound.source) engineSound.source.stop(); }, 1500);
        }
    }

    function createExplosion(pos) {
        for(let i=0; i<200; i++) {
            let idx = Math.floor(Math.random() * pCount);
            if(lifeArr[idx] <= 0) {
                lifeArr[idx] = 1.0;
                posArr[idx*3] = pos.x; posArr[idx*3+1] = pos.y; posArr[idx*3+2] = pos.z;
                velArr[idx].set((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2);
            }
        }
    }

    // Launch Sequence execution
    launchBtn.addEventListener('click', () => {
        if(missionState !== 'PLANNING') return;
        playBeep();
        missionState = 'COUNTDOWN';
        launchBtn.disabled = true;
        abortBtn.disabled = false;
        statusTxt.textContent = 'COUNTDOWN';
        statusTxt.className = 'text-neon-amber';
        
        // Reset Rocket
        coreStage.visible = true;
        rocket.position.copy(celestialBodies['Earth'].position);
        rocket.position.y += celestialBodies['Earth'].geometry.parameters.radius;
        rocket.rotation.set(0,0,0);
        
        setCameraMode('follow');
        
        let t = 5;
        const countInt = setInterval(() => {
            t--;
            missionTime.textContent = `T-00:00:0${t}`;
            if(t > 0) playBeep();
            if(t <= 0) {
                clearInterval(countInt);
                missionState = 'LAUNCH';
                statusTxt.textContent = 'LIFTOFF';
                statusTxt.className = 'text-neon-blue';
                startEngineSound();
                liftoffAnim();
            }
        }, 1000);
    });
    
    abortBtn.addEventListener('click', () => { location.reload(); });

    let missionData = {
        alt: 0, vel: 0, fuel: 100, thrust: 0
    };

    function updateTelemetry() {
        tAlt.textContent = Math.round(missionData.alt) + ' km';
        tVel.textContent = missionData.vel.toFixed(1) + ' km/s';
        tFuel.textContent = Math.max(0, Math.round(missionData.fuel)) + '%';
        tThr.textContent = Math.round(missionData.thrust) + '%';
        if(missionData.fuel < 20) tFuel.style.color = '#f04';
    }

    let rocketTween;
    function liftoffAnim() {
        missionData.thrust = 100;
        tStg.textContent = 'MAIN BOOSTER';
        
        rocketTween = gsap.to(rocket.position, {
            y: rocket.position.y + 60,
            duration: 8,
            ease: "power2.inOut",
            onUpdate: () => {
                missionData.alt += (60 * 0.1);
                missionData.vel += 0.4;
                missionData.fuel -= 0.15;
                updateTelemetry();
            },
            onComplete: () => {
                // STAGE SEPARATION
                coreStage.visible = false;
                createExplosion(rocket.position.clone().add(new THREE.Vector3(0,-2,0))); // smoke burst
                missionState = 'TRAVEL';
                statusTxt.textContent = 'TRANSIT';
                tStg.textContent = 'STAGE 2 BURN - INJECTION';
                missionData.thrust = 0;
                stopEngineSound();
                setTimeout(() => startEngineSound(), 500); // 2nd stage engine
                transitAnim();
            }
        });
    }

    function transitAnim() {
        if(!targetObj) return;
        missionData.thrust = 30;
        gsap.to(missionData, { thrust: 0, duration: 1.5, delay: 1 }); 
        
        rocketTween = gsap.to(rocket.position, {
            x: targetObj.position.x,
            y: targetObj.position.y + targetObj.geometry.parameters.radius + 20,
            z: targetObj.position.z,
            duration: 12,
            ease: "power1.inOut",
            onUpdate: () => {
                missionData.alt += 400;
                missionData.vel = 12.8;
                updateTelemetry();
                rocket.lookAt(targetObj.position);
                rocket.rotateX(-Math.PI/2);
            },
            onComplete: () => {
                missionState = 'ARRIVAL';
                statusTxt.textContent = 'ARRIVAL';
                tStg.textContent = 'COASTING';
                stopEngineSound();
                setTimeout(landingAnim, 1000);
            }
        });
    }

    function landingAnim() {
        missionState = 'LANDING';
        statusTxt.textContent = 'LANDING';
        tStg.textContent = 'RETRO-DESCENT';
        startEngineSound();
        missionData.thrust = 60;
        
        // Flip rocket engine to face target (retro burn)
        gsap.to(rocket.rotation, { x: 0, z: 0, duration: 2 });
        
        rocketTween = gsap.to(rocket.position, {
            x: targetObj.position.x,
            y: targetObj.position.y + targetObj.geometry.parameters.radius + 0.3, // touch surface
            z: targetObj.position.z,
            duration: 8,
            ease: "power3.out",
            onUpdate: () => {
                missionData.alt = Math.max(0, missionData.alt * 0.92);
                missionData.vel = Math.max(0, missionData.vel * 0.92);
                missionData.fuel -= 0.2;
                updateTelemetry();
            },
            onComplete: () => {
                missionState = 'LANDED';
                statusTxt.textContent = 'MISSION SUCCESS';
                statusTxt.className = 'text-neon-green';
                tStg.textContent = 'TOUCHDOWN';
                missionData.thrust = 0;
                missionData.alt = 0;
                missionData.vel = 0;
                updateTelemetry();
                stopEngineSound();
                playBeep();
                createExplosion(rocket.position); // celebratory dust burst
                
                // Switch to cinematic view at end
                setCameraMode('cinematic');
            }
        });
    }

    let activeCamObj = 'follow'; 
    camBtns.forEach(btn => {
        btn.addEventListener('click', e => {
            setCameraMode(e.target.dataset.cam);
            playBeep();
        });
    });

    function setCameraMode(mode) {
        activeCamObj = mode;
        camBtns.forEach(b => {
             b.classList.toggle('active', b.dataset.cam === mode);
        });
    }

    // Window resize
    window.addEventListener('resize', () => {
        const cw = window.innerWidth;
        const ch = window.innerHeight - 60;
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
        renderer.setSize(cw, ch);
    });

    function updateParticles() {
        // Rocket exhaust
        if(missionData.thrust > 0 && (missionState === 'LAUNCH' || missionState === 'TRAVEL' || missionState === 'LANDING')) {
            for(let i=0; i<4; i++) {
                let idx = Math.floor(Math.random() * pCount);
                if(lifeArr[idx] <= 0) {
                    lifeArr[idx] = 1.0;
                    let nozzlePos = new THREE.Vector3(0, coreStage.visible ? -0.5 : -0.2, 0).applyMatrix4(rocket.matrixWorld);
                    posArr[idx*3] = nozzlePos.x + (Math.random()-0.5)*0.2;
                    posArr[idx*3+1] = nozzlePos.y;
                    posArr[idx*3+2] = nozzlePos.z + (Math.random()-0.5)*0.2;
                    let downward = new THREE.Vector3(0, -2, 0).applyQuaternion(rocket.quaternion);
                    velArr[idx].set(downward.x + (Math.random()-0.5)*0.5, downward.y + (Math.random()-0.5)*0.5, downward.z + (Math.random()-0.5)*0.5);
                }
            }
        }
        
        // update existing
        for(let i=0; i<pCount; i++) {
            if(lifeArr[i] > 0) {
                lifeArr[i] -= 0.02;
                posArr[i*3] += velArr[i].x;
                posArr[i*3+1] += velArr[i].y;
                posArr[i*3+2] += velArr[i].z;
            }
        }
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.life.needsUpdate = true;
    }

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        let dt = Math.min(clock.getDelta(), 0.1); // cap dt
        
        // Simulate planet orbits
        Object.values(celestialBodies).forEach(mesh => {
            if(mesh.userData.name !== 'Sun') {
                mesh.userData.angle -= mesh.userData.speed * dt; 
                let dist = mesh.userData.dist;
                mesh.position.x = mesh.userData.orbitCenter.x + Math.cos(mesh.userData.angle) * dist;
                mesh.position.z = mesh.userData.orbitCenter.z + Math.sin(mesh.userData.angle) * dist;
                mesh.rotation.y += mesh.userData.speed * 2 * dt;
            } else {
                mesh.rotation.y += 0.05 * dt; // sun rotation
            }
        });
        
        asteroidBelt.rotation.y += 0.01 * dt;

        if(missionState === 'LAUNCH' || missionState === 'ASCENT' || missionState === 'TRAVEL' || missionState === 'LANDING') {
            timeElapsed += dt;
            let h = Math.floor(timeElapsed / 3600);
            let m = Math.floor((timeElapsed % 3600) / 60);
            let s = Math.floor(timeElapsed % 60);
            missionTime.textContent = `T+${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
        
        updateParticles();

        // Camera Logic
        if(activeCamObj === 'follow' && missionState !== 'PLANNING') {
            const offset = new THREE.Vector3(0, 8, 25).applyQuaternion(rocket.quaternion);
            camera.position.lerp(rocket.position.clone().add(offset), 0.1);
            controls.target.lerp(rocket.position, 0.1);
        } else if(activeCamObj === 'cinematic' && missionState !== 'PLANNING') {
            const timeSlow = timeElapsed * 0.5;
            camera.position.x = rocket.position.x + Math.sin(timeSlow)*35;
            camera.position.z = rocket.position.z + Math.cos(timeSlow)*35;
            camera.position.y = rocket.position.y + 15 + Math.sin(timeSlow*0.5)*10;
            controls.target.lerp(rocket.position, 0.1);
        }

        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Enable QU theme and kofi natively
    if(typeof QU !== 'undefined') QU.init({ kofi: true, theme: true });
})();
