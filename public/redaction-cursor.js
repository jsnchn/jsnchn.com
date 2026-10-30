/*
 * Redaction cursor proximity effect.
 * The closer the cursor is to an anchor, the further its font steps
 * from Redaction 10 toward Redaction 100; farther away steps back to 10.
 * Cuts are discrete, so the font jumps between the six Redaction cuts.
 * Disabled for users who prefer reduced motion.
 */
(function () {
	if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	var CUTS = ['10', '20', '35', '50', '70', '100'];
	var MAX_DIST = 160; // px at which the effect fully fades back to Redaction 10

	var anchors = Array.prototype.slice.call(document.querySelectorAll('a'));
	var lastX = -9999;
	var lastY = -9999;
	var pending = null;

	function apply() {
		pending = null;
		for (var i = 0; i < anchors.length; i++) {
			var el = anchors[i];
			var r = el.getBoundingClientRect();
			var dx = Math.max(r.left - lastX, 0, lastX - r.right);
			var dy = Math.max(r.top - lastY, 0, lastY - r.bottom);
			var dist = Math.sqrt(dx * dx + dy * dy);
			var t = Math.max(0, 1 - dist / MAX_DIST); // 0 far, 1 touching
			var idx = Math.round(t * (CUTS.length - 1));
			var value = idx === 0 ? '' : '"Redaction ' + CUTS[idx] + '", var(--font-body)';
			if (el.__redaction !== value) {
				el.__redaction = value;
				el.style.fontFamily = value;
			}
		}
	}

	function schedule() {
		if (pending === null) pending = requestAnimationFrame(apply);
	}

	function onMove(e) {
		lastX = e.clientX;
		lastY = e.clientY;
		schedule();
	}

	window.addEventListener('pointermove', onMove, { passive: true });
	window.addEventListener('scroll', schedule, { passive: true });
})();
