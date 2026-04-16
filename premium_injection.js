
(() => {
    // Premium Visual Aesthetics Injection
    document.addEventListener('DOMContentLoaded', () => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '-1';
        overlay.style.background = 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.05) 0%, transparent 80%)';
        
        // Animated particles
        for(let i=0; i<15; i++) {
            const p = document.createElement('div');
            p.style.position = 'absolute';
            p.style.width = Math.random() * 4 + 'px';
            p.style.height = p.style.width;
            p.style.background = 'rgba(139, 92, 246, 0.4)';
            p.style.borderRadius = '50%';
            p.style.left = Math.random() * 100 + 'vw';
            p.style.top = Math.random() * 100 + 'vh';
            p.style.boxShadow = '0 0 10px rgba(139, 92, 246, 0.8)';
            p.style.animation = `float ${Math.random()*10 + 10}s linear infinite`;
            overlay.appendChild(p);
        }
        document.body.appendChild(overlay);

        const style = document.createElement('style');
        style.innerHTML = `
        @keyframes float {
            0% { transform: translateY(0px) rotate(0deg); opacity:0; }
            50% { opacity:1; }
            100% { transform: translateY(-100vh) rotate(360deg); opacity:0; }
        }
        .premium-glow {
            box-shadow: 0 0 25px rgba(99, 102, 241, 0.2) !important;
            transition: box-shadow 0.3s ease !important;
        }
        .premium-glow:hover {
            box-shadow: 0 0 40px rgba(99, 102, 241, 0.5) !important;
        }
        `;
        document.head.appendChild(style);

        // Enhance elements
        document.querySelectorAll('.glass-card').forEach(c => c.classList.add('premium-glow'));
        document.querySelectorAll('button:not(.btn-icon)').forEach(b => {
            b.style.fontWeight = 'bold';
            b.style.letterSpacing = '0.5px';
            b.style.transition = 'all 0.3s ease';
        });
    });
})();
