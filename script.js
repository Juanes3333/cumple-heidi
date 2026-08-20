(() => {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /* Curtain-up: the page opens like the house curtain parting            */
  /* ------------------------------------------------------------------ */

  function playCurtainOpen() {
    const left = document.querySelector(".curtain-edge--left");
    const right = document.querySelector(".curtain-edge--right");

    // Mirrors the resting width from the CSS clamp(14px, 5vw, 46px) — read
    // here in JS since we're animating away from the closed 51vw state.
    const restWidth = Math.min(46, Math.max(14, window.innerWidth * 0.05));

    if (prefersReduced) {
      gsap.set([left, right], { width: restWidth });
      return;
    }

    gsap.to([left, right], {
      width: restWidth,
      duration: 1.3,
      ease: "power4.inOut",
      delay: 0.35,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Ambient background stars                                            */
  /* ------------------------------------------------------------------ */

  function buildStars() {
    const field = document.getElementById("stars");
    const count = 26;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const star = document.createElement("span");
      star.className = "star";
      const size = 2 + Math.random() * 2.5;
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      frag.appendChild(star);

      if (!prefersReduced) {
        gsap.to(star, {
          opacity: 0.15 + Math.random() * 0.55,
          duration: 1.8 + Math.random() * 2.4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: Math.random() * 3,
        });
      }
    }
    field.appendChild(frag);
  }

  /* ------------------------------------------------------------------ */
  /* Bulb ring around the mirror                                         */
  /* ------------------------------------------------------------------ */

  const BULB_COUNT = 16;
  let bulbs = [];

  function buildBulbRing() {
    const ring = document.getElementById("bulbRing");
    const frag = document.createDocumentFragment();
    const rx = 50;
    const ry = 50;

    for (let i = 0; i < BULB_COUNT; i++) {
      const angle = (i / BULB_COUNT) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + rx * 0.94 * Math.cos(angle);
      const y = 50 + ry * 0.94 * Math.sin(angle);
      const bulb = document.createElement("span");
      bulb.className = "bulb";
      bulb.style.left = `${x}%`;
      bulb.style.top = `${y}%`;
      frag.appendChild(bulb);
      bulbs.push(bulb);
    }
    ring.appendChild(frag);
  }

  function igniteBulbs(onDone) {
    const tl = gsap.timeline({ onComplete: onDone });
    const step = prefersReduced ? 0 : 0.045;

    // Explicit per-bulb callback rather than a single staggered tween: every
    // bulb is guaranteed to receive its own "is-lit" call, none skipped.
    bulbs.forEach((bulb, i) => {
      tl.call(() => bulb.classList.add("is-lit"), null, i * step);
    });
    tl.to({}, { duration: 0.001 }, bulbs.length * step + 0.05);
    return tl;
  }

  /* ------------------------------------------------------------------ */
  /* Pull-cord interaction                                               */
  /* ------------------------------------------------------------------ */

  function setupCord() {
    const wrap = document.getElementById("cordWrap");
    const pull = document.getElementById("cordPull");
    const line = document.getElementById("cordLine");
    const mirrorMsg = document.getElementById("mirrorMsg");

    const REST_LEN = 72; // resting length hanging straight down from the anchor

    // A real cord: it follows the pointer 1:1 up to BASE_RADIUS, then keeps
    // giving — slower and slower — well past that, instead of hitting a wall.
    // That "still moving, just heavier" feel is what reads as elastic rather
    // than clamped.
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const BASE_RADIUS = Math.min(shortSide * 0.16, 90);
    const ELASTIC_SPAN = Math.min(shortSide * 0.16, 90);
    const THRESHOLD = BASE_RADIUS + ELASTIC_SPAN * 0.45;

    const HOLD_HINT_MS = 2000;
    const DEFAULT_HINT = "Tira del cordón dorado";

    let dragging = false;
    let activated = false;
    let lastDx = 0, lastDy = 0;
    let holdTimer = null;
    let hintRevertTimer = null;

    gsap.set(pull, { xPercent: -50, yPercent: -50, x: 0, y: REST_LEN });
    gsap.set(line, { xPercent: -50, rotation: 0, height: REST_LEN });

    function rubberBand(dist) {
      if (dist <= BASE_RADIUS) return dist;
      const over = dist - BASE_RADIUS;
      return BASE_RADIUS + (over / (1 + over / (ELASTIC_SPAN * 0.9))) ;
    }

    function pointLine(dx, dy) {
      const len = Math.hypot(dx, dy);
      // CSS rotate() turns clockwise from the line's rest pose (pointing
      // straight down), which needs the horizontal component negated to
      // land on the same side as the actual pull — atan2(dx, dy) alone
      // rotates the line to the mirror-opposite side from the tassel.
      const angleDeg = Math.atan2(-dx, dy) * (180 / Math.PI); // 0deg = hanging straight down
      gsap.set(line, { height: len, rotation: angleDeg });
    }

    function anchor() {
      const r = wrap.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top };
    }

    // All guidance lives inside the mirror, in the middle of the bulb ring —
    // the one spot on screen already framed by light, so it reads as the
    // mirror "speaking" rather than a caption bolted underneath it.
    function setMirrorText(text, { temporary = false } = {}) {
      clearTimeout(hintRevertTimer);
      mirrorMsg.textContent = text;
      gsap.killTweensOf(mirrorMsg);
      gsap.fromTo(mirrorMsg, { scale: 1.1, opacity: 0.6 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.2)" });
      if (temporary) {
        hintRevertTimer = window.setTimeout(() => {
          setMirrorText(DEFAULT_HINT);
        }, 1800);
      }
    }

    function onPointerDown(e) {
      if (activated) return;
      dragging = true;
      lastDx = 0;
      lastDy = 0;
      pull.setPointerCapture(e.pointerId);

      // Holding it is progress on its own — the top bulb answers the touch
      // immediately, before she's pulled anything.
      bulbs[0].classList.add("is-lit");

      clearTimeout(hintRevertTimer);
      holdTimer = window.setTimeout(() => {
        setMirrorText("¡Suéltalo!");
      }, HOLD_HINT_MS);
    }

    function onPointerMove(e) {
      if (!dragging || activated) return;

      const a = anchor();
      const rawDx = e.clientX - a.x;
      const rawDy = e.clientY - a.y;
      const rawDist = Math.hypot(rawDx, rawDy) || 1;
      const shown = rubberBand(rawDist);
      const dx = (rawDx / rawDist) * shown;
      const dy = (rawDy / rawDist) * shown;

      lastDx = dx;
      lastDy = dy;

      gsap.set(pull, { x: dx, y: dy });
      pointLine(dx, dy);
      // Activation now happens on release, not mid-drag — see onPointerUp.
    }

    function onPointerUp() {
      if (!dragging || activated) return;
      dragging = false;
      clearTimeout(holdTimer);

      const dist = Math.hypot(lastDx, lastDy);

      if (dist >= THRESHOLD) {
        activate();
        return;
      }

      // Let go too soon: the top bulb was only a "you're holding it" cue,
      // turn it back off, snap the cord back, and ask for more next time.
      bulbs[0].classList.remove("is-lit");
      setMirrorText("¡Jálalo más duro!", { temporary: true });

      const stretch = dist / THRESHOLD; // 0..~1
      // The further it was stretched, the harder it snaps back: shorter
      // travel time, bigger elastic overshoot past the resting point.
      const duration = gsap.utils.clamp(0.5, 0.85, 0.9 - stretch * 0.35);
      const amplitude = gsap.utils.clamp(1, 1.8, 1 + stretch * 0.9);

      const proxy = { x: lastDx, y: lastDy };
      gsap.to(proxy, {
        x: 0,
        y: REST_LEN,
        duration,
        ease: `elastic.out(${amplitude}, 0.16)`,
        onUpdate: () => {
          gsap.set(pull, { x: proxy.x, y: proxy.y });
          pointLine(proxy.x, proxy.y);
        },
      });
    }

    function activate() {
      activated = true;
      clearTimeout(holdTimer);
      clearTimeout(hintRevertTimer);

      // Echo the reference video's own move: fade the cord out and drop it
      // from layout entirely once it has done its job.
      gsap.to(wrap, {
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
        onComplete: () => {
          wrap.style.display = "none";
        },
      });

      igniteBulbs(() => {
        setMirrorText("Heidi, esta noche brillas tú.");

        window.setTimeout(() => {
          goToInvite();
        }, 2000);
      });
    }

    mirrorMsg.textContent = DEFAULT_HINT;

    pull.addEventListener("pointerdown", onPointerDown);
    pull.addEventListener("pointermove", onPointerMove);
    pull.addEventListener("pointerup", onPointerUp);
    pull.addEventListener("pointercancel", onPointerUp);

    pull.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !activated) {
        e.preventDefault();
        activated = true;
        activate();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Screen transitions                                                  */
  /* ------------------------------------------------------------------ */

  function goToInvite() {
    const teaser = document.getElementById("screen-teaser");
    const invite = document.getElementById("screen-invite");
    const card = document.getElementById("inviteCard");

    gsap.to(teaser, {
      opacity: 0,
      duration: 0.5,
      ease: "power2.inOut",
      onComplete: () => {
        teaser.classList.add("screen--hidden");
        teaser.style.opacity = "";
        invite.classList.remove("screen--hidden");
        playInviteReveal(card);
      },
    });
  }

  function playInviteReveal(card) {
    const stamp = card.querySelector(".stamp");
    const strikeLine = card.querySelector(".date-old-strike");
    const reason = card.querySelector(".date-reason");
    const dateNew = card.querySelector(".date-new");
    const details = card.querySelectorAll(".details li");
    const question = card.querySelector(".card-question");
    const btnRow = card.querySelector(".btn-row");

    gsap.set(card, { opacity: 0, y: 24, scale: 0.97 });
    gsap.set([reason, dateNew, question, btnRow], { opacity: 0, y: 14 });
    gsap.set(details, { opacity: 0, x: -10 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.55 })
      .add(() => animateStrike(strikeLine), "-=0.2")
      .fromTo(
        stamp,
        { opacity: 0, scale: 0, rotate: -18 },
        { opacity: 1, scale: 1, rotate: -8, duration: 0.5, ease: "back.out(2.4)" },
        "-=0.15"
      )
      .to(reason, { opacity: 1, y: 0, duration: 0.4 }, "-=0.1")
      .to(dateNew, { opacity: 1, y: 0, duration: 0.5 }, "-=0.15")
      .to(details, { opacity: 1, x: 0, duration: 0.4, stagger: 0.09 }, "-=0.2")
      .to(question, { opacity: 1, y: 0, duration: 0.4 }, "-=0.1")
      .to(btnRow, { opacity: 1, y: 0, duration: 0.4 }, "-=0.15");
  }

  function animateStrike(strikeEl) {
    const line = document.createElement("span");
    line.style.position = "absolute";
    line.style.left = "-4%";
    line.style.right = "-4%";
    line.style.top = "52%";
    line.style.height = "2px";
    line.style.background = "var(--red-glow, #c8324a)";
    line.style.borderRadius = "2px";
    line.style.transformOrigin = "left center";
    strikeEl.appendChild(line);
    gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power2.out" });
  }

  /* ------------------------------------------------------------------ */
  /* "No" button — evades the pointer, on purpose                        */
  /* ------------------------------------------------------------------ */

  const DODGE_PHRASES = [
    "No puedo",
    "¿Segura?",
    "Nop",
    "Inténtalo de nuevo",
    "Jamás",
    "No creo",
    "¡Casi!",
    "Ni loca",
  ];

  function setupNoButton() {
    const btn = document.getElementById("btnNo");
    let phraseIndex = 0;
    let originalWidth = 0;
    let originalHeight = 0;
    let dodging = false;

    function overlapsYes(x, y, w, h) {
      const yesRect = document.getElementById("btnYes").getBoundingClientRect();
      const pad = 16;
      const left = x, top = y, right = x + w, bottom = y + h;
      const yesLeft = yesRect.left - pad;
      const yesTop = yesRect.top - pad;
      const yesRight = yesRect.right + pad;
      const yesBottom = yesRect.bottom + pad;
      return !(right < yesLeft || left > yesRight || bottom < yesTop || top > yesBottom);
    }

    function dodge() {
      const margin = 14;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (!dodging) {
        const startRect = btn.getBoundingClientRect();
        originalWidth = startRect.width;
        originalHeight = startRect.height;

        // `.card` carries a GSAP-authored transform (its entrance tween),
        // and any transformed ancestor becomes the containing block for a
        // `position: fixed` descendant — the button would then track the
        // card instead of the viewport. Move it out to <body> first so
        // "fixed" means the actual screen.
        document.body.appendChild(btn);

        btn.classList.add("is-dodging");
        // Pin the fixed-position button exactly where it already sat so the
        // switch from flex layout to viewport coordinates is invisible.
        gsap.set(btn, {
          width: originalWidth,
          height: originalHeight,
          left: startRect.left,
          top: startRect.top,
        });
        dodging = true;
      }

      const maxX = Math.max(margin, vw - originalWidth - margin);
      const maxY = Math.max(margin, vh - originalHeight - margin);

      let nextX = margin + Math.random() * (maxX - margin);
      let nextY = margin + Math.random() * (maxY - margin);
      let tries = 0;
      while (overlapsYes(nextX, nextY, originalWidth, originalHeight) && tries < 24) {
        nextX = margin + Math.random() * (maxX - margin);
        nextY = margin + Math.random() * (maxY - margin);
        tries++;
      }

      phraseIndex = (phraseIndex + 1) % DODGE_PHRASES.length;
      btn.textContent = DODGE_PHRASES[phraseIndex];

      gsap.to(btn, {
        left: nextX,
        top: nextY,
        duration: 0.34,
        ease: "back.out(2)",
      });
    }

    btn.addEventListener("mouseenter", dodge);
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dodge();
    });
    btn.addEventListener("focus", dodge);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      dodge();
    });
  }

  /* ------------------------------------------------------------------ */
  /* "Sí" button — the decorative reward                                 */
  /* ------------------------------------------------------------------ */

  function setupYesButton() {
    const btn = document.getElementById("btnYes");
    btn.addEventListener("click", goToReward);
  }

  function goToReward() {
    const invite = document.getElementById("screen-invite");
    const reward = document.getElementById("screen-reward");
    const noBtn = document.getElementById("btnNo");

    // If "No" was ever chased around, dodge() reparented it to <body> as
    // position:fixed — hiding #screen-invite alone would leave it floating
    // over every screen after this one. Fade it out explicitly either way.
    gsap.to(noBtn, { opacity: 0, duration: 0.3, onComplete: () => { noBtn.style.display = "none"; } });

    gsap.to(invite, {
      opacity: 0,
      scale: 0.98,
      duration: 0.45,
      ease: "power2.inOut",
      onComplete: () => {
        invite.classList.add("screen--hidden");
        invite.style.opacity = "";
        invite.style.scale = "";
        reward.classList.remove("screen--hidden");
        playReward();
      },
    });
  }

  function playReward() {
    const spotlight = document.querySelector(".reward-spotlight");
    const title = document.querySelector(".reward-title");
    const ticket = document.querySelector(".ticket");
    const note = document.querySelector(".reward-note");

    gsap.set(title, { opacity: 0, y: 18, scale: 0.9 });
    gsap.set(ticket, { opacity: 0, y: 46, rotate: -6, scale: 0.92 });
    gsap.set(note, { opacity: 0, y: 12 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(spotlight, { scale: 1, duration: 1.1, ease: "power2.out" })
      .to(title, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.6)" }, "-=0.7")
      // The ticket lands like it's been handed to you: a little too fast,
      // a little too tilted, then it settles flat.
      .to(ticket, { opacity: 1, y: 0, rotate: 0, scale: 1, duration: 0.7, ease: "back.out(1.5)" }, "-=0.2")
      .to(note, { opacity: 1, y: 0, duration: 0.4 }, "-=0.15");

    launchConfetti();
  }

  function launchConfetti() {
    if (prefersReduced) return;

    const layer = document.getElementById("confettiLayer");
    const w = layer.clientWidth;
    const count = 46;
    const colors = ["var(--gold)", "var(--gold-light)", "var(--red-glow)"];

    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      const isStar = Math.random() > 0.55;
      const size = 6 + Math.random() * 7;
      const color = colors[Math.floor(Math.random() * colors.length)];

      piece.style.width = `${size}px`;
      piece.style.height = `${isStar ? size : size * 0.4}px`;
      piece.style.background = color;
      piece.style.left = `${Math.random() * w}px`;
      piece.style.clipPath = isStar
        ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"
        : "none";
      piece.style.borderRadius = isStar ? "0" : "2px";
      layer.appendChild(piece);

      gsap.to(piece, {
        y: window.innerHeight * (0.85 + Math.random() * 0.35),
        x: `+=${(Math.random() - 0.5) * 160}`,
        rotation: (Math.random() - 0.5) * 540,
        opacity: 0,
        duration: 2.4 + Math.random() * 1.6,
        delay: Math.random() * 0.7,
        ease: "power1.in",
        onComplete: () => piece.remove(),
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                 */
  /* ------------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", () => {
    playCurtainOpen();
    buildStars();
    buildBulbRing();
    setupCord();
    setupNoButton();
    setupYesButton();
  });
})();
