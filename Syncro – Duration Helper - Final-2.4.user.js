// ==UserScript==
// @name         Syncro – Duration Helper - Final
// @homepageURL  https://github.com/esperto/Syncro-TamperMonkey
// @namespace    http://tampermonkey.net/
// @version      2.5.1
// @description  Add smart duration presets to both the Labor Log modal and the Comment form
// @author       Nick F + Gary H
// @match        https://*.syncromsp.com/tickets/*
// @match        https://*.shield.syncromsp.com/tickets/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var nativeSetter =
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

  /* ═══════════════════ SHARED UTILITIES ═══════════════════ */

  function parse12h(str) {
    var m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    var h = +m[1], min = +m[2];
    var pm = m[3].toUpperCase() === "PM";
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { h: h, m: min };
  }

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function fmt12h(h, m) {
    var per = h >= 12 ? "PM" : "AM";
    var dh = h % 12;
    if (dh === 0) dh = 12;
    return pad2(dh) + ":" + pad2(m) + " " + per;
  }

  function calcEndTime(fromStr, hours, minutes) {
    var from = parse12h(fromStr);
    if (!from) return null;
    var totalMin = from.h * 60 + from.m + hours * 60 + minutes;
    totalMin = totalMin % (24 * 60);
    var endH = Math.floor(totalMin / 60);
    var endM = totalMin % 60;
    return { h: endH, m: endM, display: fmt12h(endH, endM) };
  }

  function calcStartFromHM(endH, endM, hours, minutes) {
    var totalMin = endH * 60 + endM - (hours * 60 + minutes);
    totalMin = (totalMin % (24 * 60) + (24 * 60)) % (24 * 60);
    var startH = Math.floor(totalMin / 60);
    var startM = totalMin % 60;
    return { h: startH, m: startM, display: fmt12h(startH, startM) };
  }

  function nowHM() {
    var d = new Date();
    return { h: d.getHours(), m: d.getMinutes() };
  }

  function makeDurLabel(hours, minutes) {
    if (hours > 0) {
      return hours + "h" + (minutes > 0 ? " " + minutes + "m" : "");
    }
    return minutes + "m";
  }

  function formatDurationFromMinutes(totalMin) {
    totalMin = Math.max(0, Math.round(totalMin || 0));
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h === 0) return m + "m";
    if (m === 0) return h + "h";
    return h + ":" + pad2(m);
  }

  // Smart duration parser:
  // Accepts: 2h, 25m, 1.5h, 1:25, 02:30, 1h30m, 1h 30m (case-insensitive)
  // Plain number like "1.5" assumes hours.
  function parseDurationInput(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (!s) return null;

    s = s.replace(/\s+/g, " ").trim();

    // H:MM
    if (s.indexOf(":") !== -1) {
      var parts = s.split(":");
      if (parts.length !== 2) return null;
      var hh = parseInt(parts[0], 10);
      var mm = parseInt(parts[1], 10);
      if (isNaN(hh) || isNaN(mm)) return null;
      if (mm < 0 || mm > 59 || hh < 0) return null;
      return { h: hh, m: mm };
    }

    // Plain number => hours
    if (/^\d+(\.\d+)?$/.test(s)) {
      var hrs = parseFloat(s);
      if (isNaN(hrs) || hrs <= 0) return null;
      var totalMin = Math.round(hrs * 60);
      return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
    }

    // Token-based
    var lower = s.toLowerCase();
    var hasH = /h/.test(lower);
    var hasM = /m/.test(lower);

    var hours = 0;
    var minutes = 0;

    if (hasH) {
      var hm = lower.match(/(\d+(?:\.\d+)?)\s*h/);
      if (!hm) return null;
      hours = parseFloat(hm[1]);
      if (isNaN(hours) || hours < 0) return null;
    }

    if (hasM) {
      var mmatch = lower.match(/(\d+)\s*m/);
      if (!mmatch) return null;
      minutes = parseInt(mmatch[1], 10);
      if (isNaN(minutes) || minutes < 0) return null;
    }

    if (!hasH && !hasM) return null;

    var total = Math.round(hours * 60) + minutes;
    if (total < 0) return null;

    return { h: Math.floor(total / 60), m: total % 60 };
  }

  /* ═══════════════════ BAR BUILDER ═══════════════════ */

  function createBar(id) {
    var pageStyles = window.getComputedStyle(document.body);
    var fg = pageStyles.color || "#ddd";

    function rgba(color, alpha) {
      if (!color || !color.startsWith("rgb")) return color || "rgba(0,0,0," + alpha + ")";
      var vals = color.match(/\d+/g);
      if (!vals || vals.length < 3) return color;
      return "rgba(" + vals[0] + "," + vals[1] + "," + vals[2] + "," + alpha + ")";
    }

    var isDark =
      pageStyles.backgroundColor &&
      pageStyles.backgroundColor.match(/\d+/g) &&
      pageStyles.backgroundColor.match(/\d+/g)
        .slice(0, 3)
        .map(Number)
        .reduce(function (a, b) { return a + b; }, 0) / 3 < 128;

    var subtleBg = isDark ? rgba(fg, 0.06) : "#f7f8fb";
    var subtleBorder = isDark ? rgba(fg, 0.18) : "#d9dce3";
    var buttonBg = isDark ? rgba(fg, 0.10) : "#ffffff";
    var buttonHover = isDark ? rgba(fg, 0.18) : "#eef2f7";

    function makeEl(tag, attrs, text) {
      var el = document.createElement(tag);
      if (attrs) {
        for (var key in attrs) {
          if (key === "style" && typeof attrs[key] === "object") {
            Object.assign(el.style, attrs[key]);
          } else if (key === "className") {
            el.className = attrs[key];
          } else {
            el.setAttribute(key, attrs[key]);
          }
        }
      }
      if (text) el.textContent = text;
      return el;
    }

    function themedButton(text, className, extraAttrs) {
      var btn = makeEl(
        "button",
        Object.assign(
          {
            className: className,
            type: "button",
            style: {
              padding: "3px 10px",              // reduced vertical padding by 1px
              background: buttonBg,
              color: fg,
              border: "1px solid " + subtleBorder,
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "500",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap"
            }
          },
          extraAttrs || {}
        ),
        text
      );

      btn.addEventListener("mouseenter", function () {
        btn.style.background = buttonHover;
      });

      btn.addEventListener("mouseleave", function () {
        btn.style.background = buttonBg;
      });

      return btn;
    }

    var bar = document.createElement("div");
    bar.id = id;

    Object.assign(bar.style, {
      display: "flex",
      flexDirection: "column",                // two-row layout
      gap: "6px",
      marginTop: "6px",
      padding: "5px 8px",                     // reduced padding
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
      overflowX: "hidden",
      overflowY: "visible",
      background: subtleBg,
      color: fg,
      border: "1px solid " + subtleBorder,
      borderRadius: "8px",
      fontFamily: "Roboto, Helvetica, Arial, sans-serif",
      backdropFilter: "blur(4px)"
    });

    var rowTop = makeEl("div", {
      className: "tm-row-top",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap"
      }
    });

    var rowBottom = makeEl("div", {
      className: "tm-row-bottom",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap"
      }
    });

    bar.appendChild(rowTop);
    bar.appendChild(rowBottom);

    var label = makeEl(
      "span",
      {
        style: {
          fontSize: "13px",
          fontWeight: "600",
          color: fg,
          marginRight: "2px",
          whiteSpace: "nowrap"
        }
      },
      "⏱ Duration:"
    );
    rowTop.appendChild(label);

    var durInput = makeEl("input", {
      className: "tm-dur",
      type: "text",
      value: "15m",
      placeholder: "e.g. 25m, 2h, 1.5, 1:25",
      style: {
        width: "170px",
        maxWidth: "100%",
        padding: "4px 8px",
        background: isDark ? rgba(fg, 0.04) : "#ffffff",
        color: fg,
        border: "1px solid " + subtleBorder,
        borderRadius: "4px",
        fontSize: "13px",
        boxSizing: "border-box"
      }
    });
    rowTop.appendChild(durInput);

    var applyBtn = themedButton("Apply", "tm-apply", {
      style: {
        background: isDark ? "rgba(25,118,210,0.18)" : "#eaf2ff",
        color: isDark ? fg : "#174ea6",
        border: isDark
          ? "1px solid rgba(25,118,210,0.45)"
          : "1px solid #9bbcf2",
        display: "none"                        // contextual visibility
      }
    });
    rowTop.appendChild(applyBtn);

    // “Now” micro-indicator (hidden by default)
    var nowEl = makeEl("span", {
      className: "tm-now",
      style: {
        fontSize: "11px",
        color: rgba(fg, 0.65),
        whiteSpace: "nowrap",
        display: "none",
        paddingLeft: "4px"
      }
    }, "Ends at now");
    rowTop.appendChild(nowEl);

    var presets = [
      { h: 0, m: 15, text: "15m" },
      { h: 0, m: 30, text: "30m" },
      { h: 0, m: 45, text: "45m" },
      { h: 1, m: 0, text: "1h" },
      { h: 1, m: 30, text: "1.5h" },
      { h: 2, m: 0, text: "2h" }
    ];

    var presetsWrap = makeEl("div", {
      className: "tm-presets-wrap",
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        alignItems: "center",
        maxWidth: "100%",
        boxSizing: "border-box"
      }
    });
    rowBottom.appendChild(presetsWrap);

    for (var i = 0; i < presets.length; i++) {
      presetsWrap.appendChild(
        themedButton(presets[i].text, "tm-preset", {
          "data-h": String(presets[i].h),
          "data-m": String(presets[i].m)
        })
      );
    }

    // Keep a status element for compatibility, but unused (disabled output)
    bar.appendChild(
      makeEl("span", {
        className: "tm-status",
        style: { display: "none" }
      })
    );

    return bar;
  }

  function wireBar(bar, applyFn) {
    var durInput = bar.querySelector(".tm-dur");
    var applyBtn = bar.querySelector(".tm-apply");
    var nowEl = bar.querySelector(".tm-now");

    function setNowIndicator(on) {
      if (!nowEl) return;
      nowEl.style.display = on ? "inline" : "none";
    }

    function showApply(on) {
      if (!applyBtn) return;
      applyBtn.style.display = on ? "inline-block" : "none";
    }

    function showStatus(msg, color) {
      // intentionally disabled
    }

    function applyFromInput() {
      var parsed = parseDurationInput(durInput.value);
      if (!parsed || (parsed.h === 0 && parsed.m === 0)) {
        setNowIndicator(false);
        return;
      }
      applyFn(parsed.h, parsed.m, showStatus, setNowIndicator);
    }

    applyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      applyFromInput();
    });

    var presetBtns = bar.querySelectorAll(".tm-preset");
    for (var i = 0; i < presetBtns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var h = parseInt(btn.getAttribute("data-h"), 10) || 0;
          var m = parseInt(btn.getAttribute("data-m"), 10) || 0;
          durInput.value = btn.textContent || makeDurLabel(h, m);
          showApply(false);
          applyFn(h, m, showStatus, setNowIndicator);
        });
      })(presetBtns[i]);
    }

    // Contextual Apply visibility: only when typing/focused
    durInput.addEventListener("focus", function () {
      showApply(true);
    });

    durInput.addEventListener("input", function () {
      showApply(true);
    });

    durInput.addEventListener("blur", function () {
      // small delay in case user clicks Apply
      setTimeout(function () {
        if (document.activeElement !== applyBtn) {
          showApply(false);
        }
      }, 150);
    });

    // Keyboard power controls
    durInput.addEventListener("keydown", function (e) {
      var key = e.key;

      if (key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        applyFromInput();
        return;
      }

      if (key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        durInput.value = "";
        setNowIndicator(false);
        showApply(false);
        return;
      }


      var delta = 0;

      // Default arrows (no modifier)
      if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (key === "ArrowUp") delta = +15;
        else if (key === "ArrowDown") delta = -15;

        // IMPORTANT: do NOT capture left/right anymore
        // ArrowLeft / ArrowRight will behave normally (cursor movement)
      }

      // Shift + Up/Down = +/- 30 minutes
      if (e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (key === "ArrowUp") delta = +30;
        else if (key === "ArrowDown") delta = -30;
      }

      // If you prefer Ctrl instead of Shift, use this block instead (optional):
      // if (e.ctrlKey && !e.shiftKey && !e.altKey) {
      //   if (key === "ArrowUp") delta = +30;
      //   else if (key === "ArrowDown") delta = -30;
      // }

      if (delta !== 0) {
        e.preventDefault();
        e.stopPropagation();

        var parsed = parseDurationInput(durInput.value);
        var curMin = 0;
        if (parsed) curMin = parsed.h * 60 + parsed.m;

        var nextMin = Math.max(0, curMin + delta);
        durInput.value = formatDurationFromMinutes(nextMin);
        setNowIndicator(false);
        showApply(true);
      }

    });
  }

    function wireTimeFieldArrows(inputEl, setFn) {
        if (!inputEl || inputEl.__tmTimeArrowsBound) return;
        inputEl.__tmTimeArrowsBound = true;

        function toTotalMinutes(t) {
            return t.h * 60 + t.m;
        }

        function fromTotalMinutes(total) {
            total = (total % (24 * 60) + (24 * 60)) % (24 * 60);
            return { h: Math.floor(total / 60), m: total % 60 };
        }

        inputEl.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

            var dir = e.key === "ArrowUp" ? 1 : -1;

            // Ctrl (or Alt) = +/- 1 hour
            // Shift = +/- 5 minutes
            // Default = +/- 1 minute
            var deltaMin = 0;
            if (e.ctrlKey || e.altKey) deltaMin = 60 * dir;
            else if (e.shiftKey) deltaMin = 5 * dir;
            else deltaMin = 1 * dir;

            e.preventDefault();
            e.stopPropagation();

            var cur = (inputEl.value || "").trim();

            // If empty or unparsable, start from "now"
            var parsed = cur ? parse12h(cur) : null;
            if (!parsed) {
                var now = nowHM();
                parsed = { h: now.h, m: now.m };
            }

            var next = fromTotalMinutes(toTotalMinutes(parsed) + deltaMin);
            setFn(fmt12h(next.h, next.m));
        });
    }

  /* ═══════════════════ 1. LABOR LOG MODAL (React/MUI) ═══════════════════ */

  function setReactValue(el, value) {
    nativeSetter.call(el, value);

    var keys = Object.keys(el);
    var propsKey = null;
    var fiberKey = null;

    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactProps$") === 0) propsKey = keys[i];
      if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) fiberKey = keys[i];
    }

    var syntheticEvent = {
      target: el,
      currentTarget: el,
      type: "change",
      nativeEvent: new Event("change", { bubbles: true }),
      preventDefault: function () {},
      stopPropagation: function () {},
      persist: function () {},
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: false,
      timeStamp: Date.now()
    };

    if (propsKey && el[propsKey] && typeof el[propsKey].onChange === "function") {
      el[propsKey].onChange(syntheticEvent);
      return true;
    }

    if (fiberKey) {
      var node = el[fiberKey];
      for (var depth = 0; depth < 25 && node; depth++) {
        var props = node.memoizedProps || node.pendingProps;
        if (props && typeof props.onChange === "function") {
          nativeSetter.call(el, value);
          props.onChange(syntheticEvent);
          return true;
        }
        node = node.return;
      }
    }

    return false;
  }

  function injectLaborLog() {
    if (document.getElementById("tm-laborlog-helper")) return;

    var allP = document.querySelectorAll("p.MuiTypography-root");
    var heading = null;
    for (var i = 0; i < allP.length; i++) {
      if (allP[i].textContent.trim() === "Labor Log") { heading = allP[i]; break; }
    }
    if (!heading) return;

    var allLabels = document.querySelectorAll("label.MuiFormLabel-root");
    var durationLabel = null;
    for (var j = 0; j < allLabels.length; j++) {
      if (allLabels[j].textContent.trim() === "Duration") { durationLabel = allLabels[j]; break; }
    }
    if (!durationLabel) return;

    var wrapper = durationLabel.closest(".MuiFormControl-root");
    if (!wrapper) return;

    var fromInput = wrapper.querySelector('input[placeholder="From"]');
    var toInput = wrapper.querySelector('input[placeholder="To"]');
    if (!fromInput || !toInput) return;

    var bar = createBar("tm-laborlog-helper");
    wrapper.appendChild(bar);

    wireBar(bar, function (hours, minutes, showStatus, setNowIndicator) {
      if (hours === 0 && minutes === 0) {
        setNowIndicator(false);
        return;
      }

      var fromVal = fromInput.value ? fromInput.value.trim() : "";
      if (!fromVal) {
        var now = nowHM();
        var endDisplay = fmt12h(now.h, now.m);
        var start = calcStartFromHM(now.h, now.m, hours, minutes);

        var ok1 = setReactValue(fromInput, start.display);
        var ok2 = setReactValue(toInput, endDisplay);

        setNowIndicator(true); // Ends at now
        if (!ok1 || !ok2) {
          setNowIndicator(false);
        }
        return;
      }

      setNowIndicator(false);

      var result = calcEndTime(fromVal, hours, minutes);
      if (!result) return;

      setReactValue(toInput, result.display);
    });
  }

  function cleanupLaborLog() {
    var el = document.getElementById("tm-laborlog-helper");
    if (!el) return;

    var allP = document.querySelectorAll("p.MuiTypography-root");
    var found = false;
    for (var i = 0; i < allP.length; i++) {
      if (allP[i].textContent.trim() === "Labor Log") { found = true; break; }
    }
    if (!found) el.remove();
  }

  /* ═══════════════════ 2. COMMENT FORM (jQuery/Bootstrap) ═══════════════════ */

  function setTimepickerValue(inputEl, timeStr) {
    var $ = window.jQuery;
    if ($) {
      var $input = $(inputEl);
      try {
        var tpData = $input.data("timepicker");
        if (tpData && typeof tpData.setTime === "function") {
          tpData.setTime(timeStr);
          $input.trigger("change");
          return true;
        }
      } catch (e) {}
      $input.val(timeStr).trigger("change");
      return true;
    }
    inputEl.value = timeStr;
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function injectCommentForm() {
    if (document.getElementById("tm-comment-helper")) return;

    var startInput = document.getElementById("comment_start_at");
    var endInput = document.getElementById("comment_end_at");
    if (!startInput || !endInput) return;

      // Arrow keys on Start/End fields:
      // Up/Down = +/- 1 minute
      // Shift+Up/Down = +/- 5 minutes
      // Ctrl+Up/Down (or Alt+Up/Down) = +/- 1 hour
      wireTimeFieldArrows(startInput, function (v) { setTimepickerValue(startInput, v); });
      wireTimeFieldArrows(endInput, function (v) { setTimepickerValue(endInput, v); });

    var durationRow = endInput.closest(".row");
    if (!durationRow) return;

    var bar = createBar("tm-comment-helper");

    var wrapperRow = document.createElement("div");
    wrapperRow.className = "row";
    wrapperRow.style.marginTop = "8px";

    var spacerCol = document.createElement("div");
    spacerCol.className = "col-sm-2";

    var contentCol = document.createElement("div");
    contentCol.className = "col-sm-10";
    contentCol.style.width = "100%";
    contentCol.appendChild(bar);

    wrapperRow.appendChild(spacerCol);
    wrapperRow.appendChild(contentCol);

    if (durationRow.nextSibling) {
      durationRow.parentNode.insertBefore(wrapperRow, durationRow.nextSibling);
    } else {
      durationRow.parentNode.appendChild(wrapperRow);
    }

    wireBar(bar, function (hours, minutes, showStatus, setNowIndicator) {
      if (hours === 0 && minutes === 0) {
        setNowIndicator(false);
        return;
      }

      var fromVal = startInput.value ? startInput.value.trim() : "";

      // If Start is empty, set Start = now - duration, End = now
      if (!fromVal) {
        var now = nowHM();
        var endDisplay = fmt12h(now.h, now.m);
        var start = calcStartFromHM(now.h, now.m, hours, minutes);

        setTimepickerValue(startInput, start.display);
        setTimepickerValue(endInput, endDisplay);

        setNowIndicator(true); // Ends at now
        return;
      }

      setNowIndicator(false);

      var result = calcEndTime(fromVal, hours, minutes);
      if (!result) return;

      setTimepickerValue(endInput, result.display);
    });
  }

  /* ═══════════════════ DETECTION ═══════════════════ */

  function runInjections() {
    cleanupLaborLog();
    injectLaborLog();
    injectCommentForm();
  }

  var observer = new MutationObserver(runInjections);
  observer.observe(document.body, { childList: true, subtree: true });

  var pollCount = 0;
  var pollInterval = setInterval(function () {
    pollCount++;
    runInjections();
    if (document.getElementById("tm-comment-helper") || pollCount >= 15) {
      clearInterval(pollInterval);
    }
  }, 2000);

  window.addEventListener("load", function () {
    runInjections();
  });
})();
