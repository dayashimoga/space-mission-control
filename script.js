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

    let missionState = 'PLANNING'; // PLANNING, COUNTDOWN, LAUNCH, ASCENT, TRAVEL, ARRIVAL, LANDING
    let targetObj = null;
    let clock = new THREE.Clock();
    let timeElapsed = 0;
    
    // Audio Context (Synthesized sounds)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioContext();
    let engineSound;
    
    // Three.js Core
    const canvas = $('#spaceCanvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.0005);
    
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 10000);
    camera.position.set(0, 100, 300);
    
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0x222222);
    scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffffee, 2, 5000);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // Stars background
    const starsGeo = new THREE.BufferGeometry();
    const starsPos = [];
    for(let i=0; i<3000; i++) {
        starsPos.push((Math.random()-0.5)*2000, (Math.random()-0.5)*2000, (Math.random()-0.5)*2000);
    }
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starsPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent:true, opacity: 0.8 });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // Planets Setup
    const SOLAR_DATA = [
        { name: 'Earth', color: 0x3b82f6, radius: 10, dist: 150, stats: { Type: 'Planet', Gravity: '9.8 m/s²', Atmosphere: 'Yes' } },
        { name: 'Moon', color: 0xd1d5db, radius: 2.7, dist: 25, parent: 'Earth', stats: { Type: 'Moon', Gravity: '1.6 m/s²', Atmosphere: 'No' } },
        { name: 'Mars', color: 0xef4444, radius: 5.3, dist: 250, stats: { Type: 'Planet', Gravity: '3.7 m/s²', Atmosphere: 'Thin' } },
        { name: 'Jupiter', color: 0xf59e0b, radius: 25, dist: 400, stats: { Type: 'Gas Giant', Gravity: '24.7 m/s²', Atmosphere: 'Dense' } }
    ];
    
    const celestialBodies = {};
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // The Sun
    const sunGeo = new THREE.SphereGeometry(30, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sunMesh);
    celestialBodies['Sun'] = sunMesh;

    SOLAR_DATA.forEach(pd => {
        const geo = new THREE.SphereGeometry(pd.radius, 32, 32);
        const mat = new THREE.MeshPhongMaterial({ 
            color: pd.color, 
            shininess: 10, 
            flatShading: false 
        });
        const mesh = new THREE.Mesh(geo, mat);
        
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
        const orbitGeo = new THREE.RingGeometry(pd.dist-0.2, pd.dist+0.2, 64);
        const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
        const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
        orbitMesh.rotation.x = Math.PI/2;
        if(pd.parent) celestialBodies[pd.parent].add(orbitMesh);
        else scene.add(orbitMesh);

        scene.add(mesh);
        celestialBodies[pd.name] = mesh;
    });

    // Rocket Generator
    const rocket = new THREE.Group();
    // Core
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.3, roughness: 0.4 });
    const bodyHitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 16), bodyMat);
    bodyHitbox.position.y = 2;
    rocket.add(bodyHitbox);
    // Nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16), new THREE.MeshStandardMaterial({color: 0x222222}));
    nose.position.y = 4.5;
    rocket.add(nose);
    // Fins
    const finMat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
    for(let i=0; i<4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.8), finMat);
        fin.position.y = 0.5;
        fin.position.x = Math.cos(i*Math.PI/2)*0.6;
        fin.position.z = Math.sin(i*Math.PI/2)*0.6;
        rocket.add(fin);
    }
    // Engine nozzle
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 0.5, 16), new THREE.MeshStandardMaterial({color:0x333333}));
    nozzle.position.y = -0.25;
    rocket.add(nozzle);
    
    // Position rocket on Earth
    rocket.position.copy(celestialBodies['Earth'].position);
    rocket.position.y += celestialBodies['Earth'].geometry.parameters.radius + 0.5;
    rocket.scale.set(0.5, 0.5, 0.5); 
    scene.add(rocket);

    // Particle System for Engine
    const pGeo = new THREE.BufferGeometry();
    const pCount = 500;
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
    
    // Vertex shader for particles (fade out)
    const pMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xffaa00) } },
        vertexShader: `
            attribute float life;
            varying float vLife;
            void main() {
                vLife = life;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = (10.0 * life) * (50.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            varying float vLife;
            void main() {
                if(vLife < 0.01) discard;
                float dist = length(gl_PointCoord - vec2(0.5));
                if(dist > 0.5) discard;
                gl_FragColor = vec4(uColor, vLife * 0.8 * (1.0 - dist*2.0));
            }
        `,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Interaction
    renderer.domElement.addEventListener('click', e => {
        if(missionState !== 'PLANNING') return;
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / canvas.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        let intersects = raycaster.intersectObjects(Object.values(celestialBodies));
        if(intersects.length > 0) {
            const body = intersects[0].object;
            const name = Object.keys(celestialBodies).find(k => celestialBodies[k] === body);
            if(name !== 'Sun' && name !== 'Earth') {
                targetObj = body;
                sysTitle.textContent = name;
                sysStats.innerHTML = '';
                Object.entries(body.userData.stats).forEach(([k,v]) => {
                    sysStats.innerHTML += `<div class="stat-item"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`;
                });
                launchBtn.disabled = false;
                
                // Focus camera nicely using GSAP
                gsap.to(camera.position, {
                    x: body.position.x + body.geometry.parameters.radius*3,
                    y: body.position.y + body.geometry.parameters.radius*1.5,
                    z: body.position.z + body.geometry.parameters.radius*3,
                    duration: 1
                });
                controls.target.copy(body.position);
            }
        }
    });

    // Audio synth
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
            engineSound.gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime+1);
            setTimeout(() => {
                if(engineSound.source) engineSound.source.stop();
            }, 1000);
        }
    }

    // Launch Sequence
    launchBtn.addEventListener('click', () => {
        if(missionState !== 'PLANNING') return;
        playBeep();
        missionState = 'COUNTDOWN';
        launchBtn.disabled = true;
        abortBtn.disabled = false;
        statusTxt.textContent = 'COUNTDOWN';
        statusTxt.className = 'text-neon-amber';
        
        // Reset rocket position solidly on Earth
        rocket.position.copy(celestialBodies['Earth'].position);
        rocket.position.y += celestialBodies['Earth'].geometry.parameters.radius;
        rocket.rotation.set(0,0,0);
        
        // Setup Camera
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
        alt: 0, vel: 0, fuel: 100, thrust: 0, 
        rocketY: rocket.position.y
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
        tStg.textContent = 'BOOSTER IGNITION';
        
        // Launch upwards
        rocketTween = gsap.to(rocket.position, {
            y: rocket.position.y + 50,
            duration: 6,
            ease: "power2.inOut",
            onUpdate: () => {
                missionData.alt += (50 * 0.1);
                missionData.vel += 0.3;
                missionData.fuel -= 0.1;
                updateTelemetry();
            },
            onComplete: () => {
                missionState = 'TRAVEL';
                statusTxt.textContent = 'TRANSIT';
                tStg.textContent = 'ORBITAL INJECTION';
                missionData.thrust = 0;
                stopEngineSound();
                transitAnim();
            }
        });
    }

    function transitAnim() {
        if(!targetObj) return;
        missionData.thrust = 10;
        gsap.to(missionData, { thrust: 0, duration: 1 }); // cutoff
        
        tStg.textContent = 'COASTING';
        
        // Travel to target
        rocketTween = gsap.to(rocket.position, {
            x: targetObj.position.x,
            y: targetObj.position.y + targetObj.geometry.parameters.radius + 15,
            z: targetObj.position.z,
            duration: 8,
            ease: "power1.inOut",
            onUpdate: () => {
                missionData.alt += 500;
                missionData.vel = 11.2;
                updateTelemetry();
                rocket.lookAt(targetObj.position);
                rocket.rotateX(-Math.PI/2);
            },
            onComplete: () => {
                missionState = 'ARRIVAL';
                statusTxt.textContent = 'ARRIVAL';
                tStg.textContent = 'RETRO NO-BURN';
                landingAnim();
            }
        });
    }

    function landingAnim() {
        missionState = 'LANDING';
        statusTxt.textContent = 'LANDING';
        tStg.textContent = 'POWERED DESCENT';
        startEngineSound();
        missionData.thrust = 70;
        
        // Flip rocket
        gsap.to(rocket.rotation, { x: 0, z: 0, duration: 2 });
        
        rocketTween = gsap.to(rocket.position, {
            x: targetObj.position.x,
            y: targetObj.position.y + targetObj.geometry.parameters.radius,
            z: targetObj.position.z,
            duration: 6,
            ease: "power2.out",
            onUpdate: () => {
                missionData.alt = Math.max(0, missionData.alt * 0.9);
                missionData.vel = Math.max(0, missionData.vel * 0.90);
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
            }
        });
    }

    let activeCamObj = 'follow'; // free, follow, cinematic
    camBtns.forEach(btn => {
        btn.addEventListener('click', e => {
            camBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeCamObj = e.target.dataset.cam;
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
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    });

    function updateParticles() {
        if(missionState === 'LAUNCH' || missionState === 'LANDING') {
            // emit new
            for(let i=0; i<4; i++) {
                let idx = Math.floor(Math.random() * pCount);
                if(lifeArr[idx] <= 0) {
                    lifeArr[idx] = 1.0;
                    // Position at engine nozzle bottom
                    let nozzlePos = new THREE.Vector3(0, -0.5, 0).applyMatrix4(rocket.matrixWorld);
                    posArr[idx*3] = nozzlePos.x + (Math.random()-0.5)*0.5;
                    posArr[idx*3+1] = nozzlePos.y;
                    posArr[idx*3+2] = nozzlePos.z + (Math.random()-0.5)*0.5;
                    velArr[idx].set((Math.random()-0.5)*0.2, - (Math.random()*1 + 0.5), (Math.random()-0.5)*0.2);
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
            } else {
                posArr[i*3] = 10000; // hide
            }
        }
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.life.needsUpdate = true;
    }

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        let dt = clock.getDelta();
        
        // Simulate planet orbits
        Object.values(celestialBodies).forEach(mesh => {
            if(mesh.userData.name !== 'Sun') {
                mesh.userData.angle -= 0.1 * dt; 
                let dist = mesh.userData.dist;
                mesh.position.x = mesh.userData.orbitCenter.x + Math.cos(mesh.userData.angle) * dist;
                mesh.position.z = mesh.userData.orbitCenter.z + Math.sin(mesh.userData.angle) * dist;
                mesh.rotation.y += 0.5 * dt;
            }
        });

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
            // follow rocket
            const offset = new THREE.Vector3(0, 5, 20).applyQuaternion(rocket.quaternion);
            camera.position.lerp(rocket.position.clone().add(offset), 0.1);
            controls.target.lerp(rocket.position, 0.1);
        } else if(activeCamObj === 'cinematic' && missionState !== 'PLANNING') {
            // cinematic rotation
            camera.position.x = rocket.position.x + Math.sin(timeElapsed)*20;
            camera.position.z = rocket.position.z + Math.cos(timeElapsed)*20;
            camera.position.y = rocket.position.y + 10;
            controls.target.lerp(rocket.position, 0.1);
        }

        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    if(typeof QU !== 'undefined') QU.init();

    // Initial camera positioning to view Earth
    controls.target.copy(celestialBodies['Earth'].position);
    camera.position.set(
        celestialBodies['Earth'].position.x + 30, 
        celestialBodies['Earth'].position.y + 15, 
        celestialBodies['Earth'].position.z + 40
    );
})();
