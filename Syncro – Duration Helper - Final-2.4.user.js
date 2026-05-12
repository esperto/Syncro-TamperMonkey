// ==UserScript==
// @name         Syncro – Duration Helper - Final
// Credit:       https://github.com/esperto/Syncro-TamperMonkey
// @namespace    http://tampermonkey.net/
// @version      2.4 (texomans-v1)
// @description  Add h:m duration presets to both the Labor Log modal and the Comment form
// @author       Nick F
// @match        https://*.syncromsp.com/tickets/*
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

  function makeDurLabel(hours, minutes) {
    if (hours > 0) {
      return hours + "h" + (minutes > 0 ? " " + minutes + "m" : "");
    }
    return minutes + "m";
  }

  /* ═══════════════════ BAR BUILDER ═══════════════════ */

  function makeEl(tag, attrs, text) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (key === "style" && typeof attrs[key] === "object") {
          for (var s in attrs[key]) {
            el.style[s] = attrs[key][s];
          }
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

	function createBar(id) {
	  var pageStyles = window.getComputedStyle(document.body);

	  var bg = pageStyles.backgroundColor || "#222";
	  var fg = pageStyles.color || "#ddd";

	  function rgba(color, alpha) {
	    if (!color.startsWith("rgb")) return color;

	    var vals = color.match(/\d+/g);
	    if (!vals || vals.length < 3) return color;

	    return "rgba(" + vals[0] + "," + vals[1] + "," + vals[2] + "," + alpha + ")";
	  }

	  var isDark =
	    pageStyles.backgroundColor.match(/\d+/g)
	      .slice(0, 3)
	      .map(Number)
	      .reduce((a, b) => a + b, 0) / 3 < 128;

	  var subtleBg = isDark ? rgba(fg, 0.06) : "#f7f8fb";
	  var subtleBorder = isDark ? rgba(fg, 0.18) : "#d9dce3";
	  var buttonBg = isDark ? rgba(fg, 0.10) : "#ffffff";
	  var buttonHover = isDark ? rgba(fg, 0.18) : "#eef2f7";

	  var bar = document.createElement("div");
	  bar.id = id;

	  Object.assign(bar.style, {
	    display: "flex",
	    flexWrap: "wrap",
	    alignItems: "center",
	    gap: "6px",
	    marginTop: "10px",
	    padding: "10px 12px",
	    background: subtleBg,
	    color: fg,
	    border: "1px solid " + subtleBorder,
	    borderRadius: "8px",
	    fontFamily: "Roboto, Helvetica, Arial, sans-serif",
	    backdropFilter: "blur(4px)"
	  });

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
	            padding: "5px 12px",
	            background: buttonBg,
	            color: fg,
	            border: "1px solid " + subtleBorder,
	            borderRadius: "4px",
	            cursor: "pointer",
	            fontSize: "12px",
	            fontWeight: "500",
	            transition: "all 0.15s ease"
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

	  var label = makeEl(
	    "span",
	    {
	      style: {
	        fontSize: "13px",
	        fontWeight: "600",
	        color: fg
	      }
	    }
	  );

	  label.innerHTML = "&#9201; Duration:";
	  bar.appendChild(label);

	  function themedInput(className, value, max) {
	    return makeEl("input", {
	      className: className,
	      type: "number",
	      min: "0",
	      max: max,
	      value: value,
	      style: {
	        width: "46px",
	        padding: "5px 4px",
	        background: isDark ? rgba(fg, 0.04) : "#ffffff",
	        color: fg,
	        border: "1px solid " + subtleBorder,
	        borderRadius: "4px",
	        textAlign: "center",
	        fontSize: "13px"
	      }
	    });
	  }

	  bar.appendChild(themedInput("tm-hrs", "1", "23"));

	  bar.appendChild(
	    makeEl(
	      "span",
	      {
	        style: {
	          fontSize: "12px",
	          color: fg
	        }
	      },
	      "h"
	    )
	  );

	  bar.appendChild(themedInput("tm-mins", "0", "59"));

	  bar.appendChild(
	    makeEl(
	      "span",
	      {
	        style: {
	          fontSize: "12px",
	          color: fg
	        }
	      },
	      "m"
	    )
	  );

	  bar.appendChild(
	    themedButton("Apply", "tm-apply", {
	      style: {
            background: isDark ? "rgba(25,118,210,0.18)" : "#eaf2ff",
            color: isDark ? fg : "#174ea6",
            border: isDark
              ? "1px solid rgba(25,118,210,0.45)"
              : "1px solid #9bbcf2"
        }
	    })
	  );

	  bar.appendChild(
	    makeEl(
	      "span",
	      {
	        style: {
	          fontSize: "12px",
	          color: rgba(fg, 0.5),
	          marginLeft: "2px"
	        }
	      },
	      "|"
	    )
	  );

	  var presets = [
	    { h: 0, m: 15, text: "15m" },
	    { h: 0, m: 30, text: "30m" },
	    { h: 0, m: 45, text: "45m" },
	    { h: 1, m: 0, text: "1h" },
	    { h: 1, m: 30, text: "1.5h" },
	    { h: 2, m: 0, text: "2h" }
	  ];

	  for (var i = 0; i < presets.length; i++) {
	    bar.appendChild(
	      themedButton(presets[i].text, "tm-preset", {
	        "data-h": String(presets[i].h),
	        "data-m": String(presets[i].m)
	      })
	    );
	  }

	  bar.appendChild(
	    makeEl("span", {
	      className: "tm-status",
	      style: {
	        fontSize: "12px",
	        color: rgba(fg, 0.8),
	        marginLeft: "auto"
	      }
	    })
	  );

	  return bar;
	}

  function wireBar(bar, applyFn) {
    var hrsInput = bar.querySelector(".tm-hrs");
    var minsInput = bar.querySelector(".tm-mins");
    var applyBtn = bar.querySelector(".tm-apply");
    var statusEl = bar.querySelector(".tm-status");

    function showStatus(msg, color) {
      statusEl.textContent = msg;
      statusEl.style.color = color || "#555";
    }

    applyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var h = parseInt(hrsInput.value, 10) || 0;
      var m = parseInt(minsInput.value, 10) || 0;
      applyFn(h, m, showStatus);
    });

    var presetBtns = bar.querySelectorAll(".tm-preset");
    for (var i = 0; i < presetBtns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var h = parseInt(btn.getAttribute("data-h"), 10);
          var m = parseInt(btn.getAttribute("data-m"), 10);
          hrsInput.value = h;
          minsInput.value = m;
          applyFn(h, m, showStatus);
        });
      })(presetBtns[i]);
    }

    var inputs = [hrsInput, minsInput];
    for (var j = 0; j < inputs.length; j++) {
      inputs[j].addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          applyBtn.click();
        }
      });
    }
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
      target: el, currentTarget: el, type: "change",
      nativeEvent: new Event("change", { bubbles: true }),
      preventDefault: function () {}, stopPropagation: function () {},
      persist: function () {}, bubbles: true, cancelable: true,
      defaultPrevented: false, eventPhase: 0, isTrusted: false,
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

    wireBar(bar, function (hours, minutes, showStatus) {
      if (hours === 0 && minutes === 0) {
        showStatus("Enter a duration first", "#c62828");
        return;
      }
      var result = calcEndTime(fromInput.value, hours, minutes);
      if (!result) {
        showStatus("Set a valid From time first", "#c62828");
        return;
      }
      var success = setReactValue(toInput, result.display);
      if (success) {
        showStatus(fromInput.value + " + " + makeDurLabel(hours, minutes) + " = " + result.display, "#2e7d32");
      } else {
        showStatus("Could not set To field", "#c62828");
      }
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
      } catch (e) { /* fallback below */ }
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

    var durationRow = endInput.closest(".row");
    if (!durationRow) return;

    var bar = createBar("tm-comment-helper");

    var wrapperRow = document.createElement("div");
    wrapperRow.className = "row";
    wrapperRow.style.marginTop = "8px";

    var spacerCol = document.createElement("div");
    spacerCol.className = "col-sm-2";

    var contentCol = document.createElement("div");
    contentCol.className = "col-sm-8";
    contentCol.appendChild(bar);

    wrapperRow.appendChild(spacerCol);
    wrapperRow.appendChild(contentCol);

    if (durationRow.nextSibling) {
      durationRow.parentNode.insertBefore(wrapperRow, durationRow.nextSibling);
    } else {
      durationRow.parentNode.appendChild(wrapperRow);
    }

    wireBar(bar, function (hours, minutes, showStatus) {
      if (hours === 0 && minutes === 0) {
        showStatus("Enter a duration first", "#c62828");
        return;
      }
      var fromVal = startInput.value ? startInput.value.trim() : "";
      if (!fromVal) {
        showStatus("Set a Start time first", "#c62828");
        return;
      }
      var result = calcEndTime(fromVal, hours, minutes);
      if (!result) {
        showStatus("Could not parse Start time", "#c62828");
        return;
      }
      var success = setTimepickerValue(endInput, result.display);
      if (success) {
        showStatus(fromVal + " + " + makeDurLabel(hours, minutes) + " = " + result.display, "#2e7d32");
      } else {
        showStatus("Could not set End field", "#c62828");
      }
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
