    document.documentElement.classList.add("hp-js");

    function isMarketingDevHost() {
      var h = window.location.hostname;
      return h === "localhost" || h === "127.0.0.1";
    }

    function marketingDevLog() {
      if (isMarketingDevHost()) {
        console.log.apply(console, arguments);
      }
    }

    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    window.addEventListener("load", function () {
      window.scrollTo(0, 0);
    });

    document.addEventListener("click", function (e) {
      var dropdowns = document.querySelectorAll(".hp-nav-dropdown");
      for (var i = 0; i < dropdowns.length; i++) {
        if (!dropdowns[i].contains(e.target)) {
          dropdowns[i].removeAttribute("open");
        }
      }
    });

    var navToggle = document.getElementById("hp-nav-toggle");
    var headerInner = document.querySelector(".hp-header-inner");
    if (navToggle && headerInner) {
      navToggle.addEventListener("click", function () {
        var open = headerInner.classList.toggle("hp-nav-open");
        navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    function setOptionalTextIcon(el, value, fallback) {
      if (!el || el.querySelector("svg")) return;
      el.textContent = String(value || fallback || "");
    }

    var yEl = document.getElementById("y");
    if (yEl) yEl.textContent = new Date().getFullYear();

    function publicApiBase() {
      var m = document.querySelector('meta[name="onroda-public-api-base"]');
      if (m && m.getAttribute("content")) {
        return String(m.getAttribute("content")).replace(/\/$/, "");
      }
      var h = window.location.hostname;
      if (h === "localhost" || h === "127.0.0.1") {
        return "http://" + h + ":3000/api";
      }
      return "https://api.onroda.de/api";
    }

    function hintTypeMeta(item) {
      var raw = item && (item.type != null && item.type !== "" ? item.type : item.tone);
      raw = String(raw || "info").toLowerCase();
      if (raw === "neutral") raw = "info";
      if (raw === "success") return { cls: "success", icon: "✅" };
      if (raw === "warning") return { cls: "warning", icon: "⚠️" };
      if (raw === "important") return { cls: "important", icon: "❗" };
      return { cls: "info", icon: "ℹ️" };
    }

    /** Fallback falls API noch alt — Server normalisiert beim Speichern (germanMarketingText.ts). */
    function normalizeDeUmlauts(str) {
      if (str == null || typeof str !== "string") return str;
      return str
        .replace(/Für Fahrgaeste/gi, "Für Fahrgäste")
        .replace(/\bFahrgaeste\b/gi, "Fahrgäste")
        .replace(/\bFahrgaste\b/gi, "Fahrgäste")
        .replace(/\bfuer\b/gi, "für")
        .replace(/\bGaeste\b/gi, "Gäste");
    }

    function pickCms(value, fallback) {
      var raw = value != null && String(value).trim() !== "" ? String(value) : String(fallback || "");
      return normalizeDeUmlauts(raw).trim();
    }

    function setMultilineText(target, text) {
      if (!target) return;
      var s = normalizeDeUmlauts(String(text || ""));
      target.innerHTML = "";
      var parts = s.split(/\r?\n/);
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) target.appendChild(document.createElement("br"));
        target.appendChild(document.createTextNode(parts[i]));
      }
    }

    function buildPlaceholderNode(item) {
      var meta = hintTypeMeta(item);
      var wrap = document.createElement("article");
      wrap.className = "hp-dynamic-placeholder hp-dynamic-placeholder--" + meta.cls;
      var line = document.createElement("p");
      line.className = "hp-dynamic-placeholder__line";

      var icon = document.createElement("span");
      icon.className = "hp-dynamic-placeholder__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = meta.icon;
      line.appendChild(icon);

      var title = document.createElement("strong");
      title.className = "hp-dynamic-placeholder__title";
      title.textContent = "Hinweis:";
      line.appendChild(title);

      var msg = document.createElement("span");
      msg.className = "hp-dynamic-placeholder__msg";
      msg.textContent = " " + String(item.message || item.title || "");
      line.appendChild(msg);
      wrap.appendChild(line);

      if (item.ctaLabel && item.ctaUrl) {
        var cta = document.createElement("a");
        cta.className = "hp-dynamic-placeholder__cta";
        cta.href = String(item.ctaUrl);
        cta.textContent = String(item.ctaLabel);
        if (/^https?:\/\//i.test(String(item.ctaUrl))) {
          cta.target = "_blank";
          cta.rel = "noopener noreferrer";
        }
        wrap.appendChild(cta);
      }

      if (item.dismissKey) {
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "hp-dynamic-placeholder__dismiss";
        closeBtn.setAttribute("aria-label", "Hinweis ausblenden");
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", function () {
          try {
            localStorage.setItem("onroda:hint:dismissed:" + String(item.dismissKey), "1");
          } catch (_e) {
            // ignore storage failures
          }
          wrap.remove();
        });
        wrap.appendChild(closeBtn);
      }

      return wrap;
    }

    function hintDismissed(item) {
      if (!item || !item.dismissKey) return false;
      try {
        return localStorage.getItem("onroda:hint:dismissed:" + String(item.dismissKey)) === "1";
      } catch (_e) {
        return false;
      }
    }

    function clearHomepageBannerRoot(noticeRoot) {
      if (!noticeRoot) return;
      noticeRoot.innerHTML = "";
      noticeRoot.classList.remove("hp-dynamic-placeholders");
      noticeRoot.removeAttribute("aria-live");
    }

    /**
     * Bündelt API-Hinweise (homepage-hints) und optionalen CMS-Hinweis (homepage-content.notice*).
     * Läuft nach homepage-content, damit nichts asynchron die Zone überschreibt. Kein leerer Banner, wenn beides leer.
     */
    function renderHomepageBanners(cmsItem) {
      var host = window.location.hostname;
      if (host !== "onroda.de" && host !== "www.onroda.de" && host !== "localhost" && host !== "127.0.0.1") {
        return;
      }
      var noticeRoot = document.getElementById("homepage-placeholders-root");
      if (!noticeRoot) return;
      fetch(publicApiBase() + "/public/homepage-hints", { method: "GET", credentials: "omit" })
        .then(function (res) {
          if (!res.ok) return { ok: false, items: [] };
          return res.json().catch(function () { return { ok: false, items: [] }; });
        })
        .then(function (data) {
          var items = data && data.ok && Array.isArray(data.items) ? data.items : [];
          clearHomepageBannerRoot(noticeRoot);
          var added = 0;
          for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (hintDismissed(item)) continue;
            if (!noticeRoot.classList.contains("hp-dynamic-placeholders")) {
              noticeRoot.classList.add("hp-dynamic-placeholders");
            }
            noticeRoot.setAttribute("aria-live", "polite");
            noticeRoot.appendChild(buildPlaceholderNode(item));
            added += 1;
          }
          if (cmsItem && cmsItem.noticeActive && String(cmsItem.noticeText || "").trim()) {
            if (!noticeRoot.classList.contains("hp-dynamic-placeholders")) {
              noticeRoot.classList.add("hp-dynamic-placeholders");
            }
            noticeRoot.setAttribute("aria-live", "polite");
            noticeRoot.appendChild(
              buildPlaceholderNode({
                type: "info",
                message: String(cmsItem.noticeText || ""),
                title: "Hinweis",
              }),
            );
            added += 1;
          }
          if (added === 0) {
            clearHomepageBannerRoot(noticeRoot);
          }
        })
        .catch(function () {
          if (!noticeRoot) return;
          clearHomepageBannerRoot(noticeRoot);
          if (cmsItem && cmsItem.noticeActive && String(cmsItem.noticeText || "").trim()) {
            noticeRoot.classList.add("hp-dynamic-placeholders");
            noticeRoot.setAttribute("aria-live", "polite");
            noticeRoot.appendChild(
              buildPlaceholderNode({
                type: "info",
                message: String(cmsItem.noticeText || ""),
                title: "Hinweis",
              }),
            );
          }
        });
    }

    function loadHomepageContent() {
      var host = window.location.hostname;
      if (host !== "onroda.de" && host !== "www.onroda.de" && host !== "localhost" && host !== "127.0.0.1") {
        return;
      }
      var headlineEl = document.getElementById("hero-headline");
      var sublineEl = document.getElementById("hero-subline");
      var cta1El = document.getElementById("hero-cta1");
      var cta2El = document.getElementById("hero-cta2");
      var section2TitleEl = document.getElementById("fuer-wen-heading");
      var defaultHeadline = headlineEl ? headlineEl.innerText || "" : "";
      var defaultSubline = sublineEl ? sublineEl.textContent || "" : "";
      var defaultCta1Text = cta1El ? cta1El.textContent || "" : "";
      var defaultCta1Link = cta1El ? cta1El.getAttribute("href") || "" : "";
      var defaultCta2Text = cta2El ? cta2El.textContent || "" : "";
      var defaultCta2Link = cta2El ? cta2El.getAttribute("href") || "" : "";
      var defaultSection2Title = section2TitleEl ? section2TitleEl.textContent || "" : "";
      var url = publicApiBase() + "/public/homepage-content";
      fetch(url, { method: "GET", credentials: "omit" })
        .then(function (res) {
          if (!res.ok) return { ok: false, item: null };
          return res.json().catch(function () { return { ok: false, item: null }; });
        })
        .then(function (data) {
          var item = data && data.ok ? data.item : null;
          if (headlineEl) {
            setMultilineText(headlineEl, pickCms(item && item.heroHeadline, defaultHeadline));
          }
          if (sublineEl) {
            sublineEl.textContent = pickCms(item && item.heroSubline, defaultSubline);
          }
          if (cta1El) {
            cta1El.textContent = pickCms(item && item.cta1Text, defaultCta1Text);
            cta1El.setAttribute("href", (item && item.cta1Link ? item.cta1Link : defaultCta1Link) || "#jetzt-buchen");
          }
          if (cta2El) {
            cta2El.textContent = pickCms(item && item.cta2Text, defaultCta2Text);
            cta2El.setAttribute("href", (item && item.cta2Link ? item.cta2Link : defaultCta2Link) || "#services");
          }
          if (section2TitleEl) {
            section2TitleEl.textContent = pickCms(item && item.section2Title, defaultSection2Title);
          }
          var cards = item && Array.isArray(item.section2Cards) ? item.section2Cards : [];
          for (var i = 1; i <= 4; i++) {
            var cardWrap = document.getElementById("section2-card-" + i);
            var iconEl = document.getElementById("section2-card-" + i + "-icon");
            var titleEl = document.getElementById("section2-card-" + i + "-title");
            var bodyEl = document.getElementById("section2-card-" + i + "-body");
            var ctaEl = document.getElementById("section2-card-" + i + "-cta");
            if (!cardWrap || !iconEl || !titleEl || !bodyEl || !ctaEl) continue;
            var defaultIcon = iconEl.textContent || "";
            var defaultTitle = titleEl.textContent || "";
            var defaultBody = bodyEl.textContent || "";
            var defaultCtaText = ctaEl.textContent || "";
            var defaultCtaHref = ctaEl.getAttribute("href") || "#";
            var c = cards[i - 1] || null;
            var active = c ? c.isActive !== false : !cardWrap.hasAttribute("hidden");
            if (!active) {
              cardWrap.setAttribute("hidden", "hidden");
              continue;
            }
            cardWrap.removeAttribute("hidden");
            setOptionalTextIcon(iconEl, c && c.icon ? c.icon : null, defaultIcon);
            titleEl.textContent = pickCms(c && c.title, defaultTitle);
            bodyEl.textContent = pickCms(c && c.body, defaultBody);
            var ctaLabel = ctaEl.querySelector(".hp-audience-card__link-label");
            var ctaRaw = pickCms(c && c.ctaText, defaultCtaText);
            var ctaClean = String(ctaRaw).replace(/\s*→\s*$/u, "").trim();
            if (ctaLabel) {
              ctaLabel.textContent = ctaClean || defaultCtaText.replace(/\s*→\s*$/u, "").trim();
            } else {
              ctaEl.textContent = ctaRaw;
            }
            ctaEl.setAttribute("href", String(c && c.ctaLink ? c.ctaLink : defaultCtaHref));
          }
          var servicesKickerEl = document.getElementById("services-kicker");
          var servicesTitleEl = document.getElementById("services-title");
          var servicesSubEl = document.getElementById("services-sub");
          var defaultSk = servicesKickerEl ? servicesKickerEl.textContent || "" : "";
          var defaultSt = servicesTitleEl ? servicesTitleEl.textContent || "" : "";
          var defaultSs = servicesSubEl ? servicesSubEl.textContent || "" : "";
          if (servicesKickerEl) {
            servicesKickerEl.textContent = pickCms(item && item.servicesKicker, defaultSk);
          }
          if (servicesTitleEl) {
            servicesTitleEl.textContent = pickCms(item && item.servicesTitle, defaultSt);
          }
          if (servicesSubEl) {
            servicesSubEl.textContent = pickCms(item && item.servicesSubline, defaultSs);
          }
          var svc = item && Array.isArray(item.servicesCards) ? item.servicesCards : [];
          for (var s = 1; s <= 3; s++) {
            var scWrap = document.getElementById("services-card-" + s);
            var scIcon = document.getElementById("services-card-" + s + "-icon");
            var scTitle = document.getElementById("services-card-" + s + "-title");
            var scBody = document.getElementById("services-card-" + s + "-body");
            if (!scWrap || !scIcon || !scTitle || !scBody) continue;
            var dIcon = scIcon.textContent || "";
            var dTitle = scTitle.textContent || "";
            var dBody = scBody.textContent || "";
            var sc = svc[s - 1] || null;
            var sActive = sc ? sc.isActive !== false : true;
            if (!sActive) {
              scWrap.setAttribute("hidden", "hidden");
              continue;
            }
            scWrap.removeAttribute("hidden");
            setOptionalTextIcon(scIcon, sc && sc.icon ? sc.icon : null, dIcon);
            scTitle.textContent = pickCms(sc && sc.title, dTitle);
            scBody.textContent = pickCms(sc && sc.body, dBody);
          }
          var manKEl = document.getElementById("manifest-kicker");
          var manTitleEl = document.getElementById("manifest-title");
          var manSubEl = document.getElementById("manifest-sub");
          var dMk = manKEl ? manKEl.textContent || "" : "";
          var dMt = manTitleEl ? manTitleEl.textContent || "" : "";
          var dMs = manSubEl ? manSubEl.textContent || "" : "";
          if (manKEl) {
            manKEl.textContent = pickCms(item && item.manifestKicker, dMk);
          }
          if (manTitleEl) {
            manTitleEl.textContent = pickCms(item && item.manifestTitle, dMt);
          }
          if (manSubEl) {
            manSubEl.textContent = pickCms(item && item.manifestSubline, dMs);
          }
          var mcards = item && Array.isArray(item.manifestCards) ? item.manifestCards : [];
          for (var m = 1; m <= 4; m++) {
            var mWrap = document.getElementById("manifest-card-" + m);
            var mNum = document.getElementById("manifest-card-" + m + "-num");
            var mIcon = document.getElementById("manifest-card-" + m + "-icon");
            var mTit = document.getElementById("manifest-card-" + m + "-title");
            var mBody = document.getElementById("manifest-card-" + m + "-body");
            var mCta = document.getElementById("manifest-card-" + m + "-cta");
            if (!mWrap || !mNum || !mIcon || !mTit || !mBody || !mCta) continue;
            var dNum = mNum.textContent || "";
            var dMI = mIcon.textContent || "";
            var dMTi = mTit.textContent || "";
            var dMBo = mBody.textContent || "";
            var dMCt = mCta.textContent || "";
            var dMCh = mCta.getAttribute("href") || "#";
            var mc = mcards[m - 1] || null;
            var mAct = mc ? mc.isActive !== false : true;
            if (!mAct) {
              mWrap.setAttribute("hidden", "hidden");
              continue;
            }
            mWrap.removeAttribute("hidden");
            var n = mc && String(mc.num || "").trim() ? String(mc.num).trim() : dNum;
            mNum.textContent = n;
            setOptionalTextIcon(mIcon, mc && mc.icon ? mc.icon : null, dMI);
            mTit.textContent = pickCms(mc && mc.title, dMTi);
            mBody.textContent = pickCms(mc && mc.body, dMBo);
            mCta.textContent = pickCms(mc && mc.ctaText, dMCt);
            mCta.setAttribute("href", String(mc && mc.ctaLink ? mc.ctaLink : dMCh));
          }
          var aboutIntroEl = document.getElementById("about-intro");
          var aboutVisionEl = document.getElementById("about-vision");
          var aboutBulletsEl = document.getElementById("about-bullets");
          var aboutClosingEl = document.getElementById("about-closing");
          var aboutTaglineEl = document.getElementById("about-tagline");
          var dAboutIntro = aboutIntroEl ? aboutIntroEl.textContent || "" : "";
          var dAboutVision = aboutVisionEl ? aboutVisionEl.textContent || "" : "";
          var dAboutClosing = aboutClosingEl ? aboutClosingEl.textContent || "" : "";
          var dAboutTagline = aboutTaglineEl ? aboutTaglineEl.textContent || "" : "";
          if (aboutIntroEl) {
            setMultilineText(aboutIntroEl, pickCms(item && item.aboutIntro, dAboutIntro));
          }
          if (aboutVisionEl) {
            aboutVisionEl.textContent = pickCms(item && item.aboutVision, dAboutVision);
          }
          if (aboutClosingEl) {
            aboutClosingEl.textContent = pickCms(item && item.aboutClosing, dAboutClosing);
          }
          if (aboutTaglineEl) {
            aboutTaglineEl.textContent = pickCms(item && item.aboutTagline, dAboutTagline);
          }
          if (aboutBulletsEl) {
            var defaultBullets = [];
            var defaultLis = aboutBulletsEl.querySelectorAll("li");
            for (var ab = 0; ab < defaultLis.length; ab++) {
              defaultBullets.push(defaultLis[ab].textContent || "");
            }
            var cmsBullets = item && Array.isArray(item.aboutBullets) ? item.aboutBullets : [];
            var useBullets = cmsBullets.length > 0 ? cmsBullets : defaultBullets;
            aboutBulletsEl.innerHTML = "";
            for (var ab2 = 0; ab2 < useBullets.length; ab2++) {
              var bulletText = String(useBullets[ab2] || "").trim();
              if (!bulletText) continue;
              var liEl = document.createElement("li");
              var dash = bulletText.indexOf(" — ");
              if (dash < 0) {
                dash = bulletText.indexOf(" - ");
              }
              liEl.textContent = dash > 0 ? bulletText.slice(0, dash).trim() : bulletText;
              aboutBulletsEl.appendChild(liEl);
            }
          }
          renderHomepageBanners(item);
        })
        .catch(function () {
          renderHomepageBanners(null);
        });
    }

    function setAboutPageBulletText(span, text) {
      if (!span) return;
      var raw = String(text || "").trim();
      span.textContent = "";
      if (!raw) return;
      var idx = raw.indexOf(" — ");
      if (idx < 0) {
        idx = raw.indexOf(" - ");
      }
      if (idx > 0) {
        var strong = document.createElement("strong");
        strong.textContent = raw.slice(0, idx).trim();
        span.appendChild(strong);
        span.appendChild(document.createTextNode(" — " + raw.slice(idx + 3).trim()));
        return;
      }
      span.textContent = raw;
    }

    function applyAboutCmsToPage(item) {
      var headlineEl = document.getElementById("about-page-headline");
      if (!headlineEl) return;

      var sublineEl = document.getElementById("about-page-subline");
      var introEl = document.getElementById("about-page-intro");
      var visionEl = document.getElementById("about-page-vision");
      var closingEl = document.getElementById("about-page-closing");
      var taglineEl = document.getElementById("about-page-tagline");
      var bulletsRoot = document.getElementById("about-page-bullets");

      var dHead = headlineEl.textContent || "";
      var dSub = sublineEl ? sublineEl.textContent || "" : "";
      var dIntro = introEl ? introEl.textContent || "" : "";
      var dVision = visionEl ? visionEl.textContent || "" : "";
      var dClosing = closingEl ? closingEl.textContent || "" : "";
      var dTag = taglineEl ? taglineEl.textContent || "" : "";

      headlineEl.textContent = pickCms(item && item.aboutTitle, dHead);
      if (sublineEl) {
        sublineEl.textContent = pickCms(item && item.aboutChallengesIntro, dSub);
      }
      if (introEl) {
        setMultilineText(introEl, pickCms(item && item.aboutIntro, dIntro));
      }
      if (visionEl) {
        visionEl.textContent = pickCms(item && item.aboutVision, dVision);
      }
      if (closingEl) {
        closingEl.textContent = pickCms(item && item.aboutClosing, dClosing);
      }
      if (taglineEl) {
        taglineEl.textContent = pickCms(item && item.aboutTagline, dTag);
      }

      if (bulletsRoot) {
        var textSpans = bulletsRoot.querySelectorAll(".about-page-bullet-text");
        var defaultBullets = [];
        for (var bi = 0; bi < textSpans.length; bi++) {
          defaultBullets.push(textSpans[bi].textContent || "");
        }
        var cmsBullets = item && Array.isArray(item.aboutBullets) ? item.aboutBullets : [];
        var useBullets = cmsBullets.length > 0 ? cmsBullets : defaultBullets;
        for (var bj = 0; bj < textSpans.length; bj++) {
          var bulletRaw = bj < useBullets.length ? useBullets[bj] : "";
          setAboutPageBulletText(textSpans[bj], bulletRaw);
          var li = textSpans[bj].closest ? textSpans[bj].closest("li") : null;
          if (li) {
            if (String(bulletRaw || "").trim()) {
              li.removeAttribute("hidden");
            } else {
              li.setAttribute("hidden", "hidden");
            }
          }
        }
      }
    }

    function loadAboutPageContent() {
      if (!document.getElementById("about-page-headline")) return;
      var host = window.location.hostname;
      if (host !== "onroda.de" && host !== "www.onroda.de" && host !== "localhost" && host !== "127.0.0.1") {
        return;
      }
      var url = publicApiBase() + "/public/homepage-content";
      fetch(url, { method: "GET", credentials: "omit" })
        .then(function (res) {
          if (!res.ok) return { ok: false, item: null };
          return res.json().catch(function () { return { ok: false, item: null }; });
        })
        .then(function (data) {
          var item = data && data.ok ? data.item : null;
          applyAboutCmsToPage(item);
        })
        .catch(function () {});
    }

    function loadHomepageModules() {
      var host = window.location.hostname;
      if (host !== "onroda.de" && host !== "www.onroda.de" && host !== "localhost" && host !== "127.0.0.1") {
        return;
      }
      /* Prozess-Schritte: festes 5-Schritte-Layout in index.html (Buchen → Abrechnung).
         Kein Override durch /public/homepage-how — DB hatte noch 3 alte „Fahrt anfragen“-Texte. */

      fetch(publicApiBase() + "/public/homepage-trust", { method: "GET", credentials: "omit" })
        .then(function (r) {
          if (!r.ok) return { ok: false, items: [] };
          return r.json().catch(function () { return { ok: false, items: [] }; });
        })
        .then(function (j) {
          var items = j && j.ok && Array.isArray(j.items) ? j.items : [];
          for (var i = 1; i <= 4; i++) {
            var wrap = document.getElementById("trust-card-" + i);
            var value = document.getElementById("trust-card-" + i + "-value");
            var label = document.getElementById("trust-card-" + i + "-label");
            var desc = document.getElementById("trust-card-" + i + "-desc");
            if (!wrap || !value || !label || !desc) continue;
            var dVal = value.textContent || "";
            var dLbl = label.textContent || "";
            var dDesc = desc.textContent || "";
            var it = items[i - 1] || null;
            var active = it ? it.isActive !== false : true;
            if (!active) {
              wrap.setAttribute("hidden", "hidden");
              continue;
            }
            wrap.removeAttribute("hidden");
            value.textContent = pickCms(it && it.value, dVal);
            label.textContent = pickCms(it && it.label, dLbl);
            desc.textContent = pickCms(it && it.description, dDesc);
          }
        })
        .catch(function () {});

      fetch(publicApiBase() + "/public/homepage-faq", { method: "GET", credentials: "omit" })
        .then(function (r) {
          if (!r.ok) return { ok: false, items: [] };
          return r.json().catch(function () { return { ok: false, items: [] }; });
        })
        .then(function (j) {
          var items = j && j.ok && Array.isArray(j.items) ? j.items : [];
          for (var i = 1; i <= 8; i++) {
            var wrap = document.getElementById("faq-item-" + i);
            var q = document.getElementById("faq-item-" + i + "-question");
            var a = document.getElementById("faq-item-" + i + "-answer");
            var it = items[i - 1] || null;
            if (!wrap && it) {
              var root = document.getElementById("faq-list-root");
              if (!root) continue;
              wrap = document.createElement("details");
              wrap.className = "hp-faq-item";
              wrap.id = "faq-item-" + i;
              q = document.createElement("summary");
              q.id = "faq-item-" + i + "-question";
              a = document.createElement("p");
              a.id = "faq-item-" + i + "-answer";
              wrap.appendChild(q);
              wrap.appendChild(a);
              root.appendChild(wrap);
            }
            if (!wrap || !q || !a) continue;
            var dQ = q.textContent || "";
            var dA = a.textContent || "";
            var active = it ? it.isActive !== false : true;
            if (!active) {
              wrap.setAttribute("hidden", "hidden");
              continue;
            }
            wrap.removeAttribute("hidden");
            q.textContent = pickCms(it && it.question, dQ);
            a.textContent = pickCms(it && it.answer, dA);
          }
        })
        .catch(function () {});
    }

    loadHomepageContent();
    loadAboutPageContent();
    loadHomepageModules();

    function motionModalLog() {
      if (
        isMarketingDevHost() ||
        /[?&]motion_debug=1(?:&|$)/.test(window.location.search)
      ) {
        console.log.apply(console, arguments);
      }
    }

    function initHeroMotionModal() {
      var modal = document.getElementById("hp-motion-modal");
      var iframe = document.getElementById("hp-motion-iframe");
      var video = document.getElementById("hp-motion-video");
      var fallback = document.getElementById("hp-motion-fallback");
      var fallbackLink = document.getElementById("hp-motion-fallback-link");
      var tabs = modal ? modal.querySelectorAll("[data-motion-tab]") : [];
      if (!modal || !iframe) {
        motionModalLog("[motion-modal] init skipped: modal or iframe missing");
        return;
      }

      function normalizeEmbedUrl(url) {
        var u = String(url || "");
        if (!u) return "";
        if (u.indexOf("embed=1") < 0) {
          u += (u.indexOf("?") >= 0 ? "&" : "?") + "embed=1";
        }
        return u;
      }

      var customerSrc = normalizeEmbedUrl(
        modal.getAttribute("data-motion-customer-iframe-src") || "/motion/kunde/motion-test-kunde.html",
      );
      var medicalSrc = normalizeEmbedUrl(
        modal.getAttribute("data-motion-medical-iframe-src") || "/motion/krankenfahrt/motion-test-krankenfahrt.html",
      );
      var platformSrc = normalizeEmbedUrl(
        modal.getAttribute("data-motion-platform-iframe-src") || "/motion/plattform/motion-test-plattform.html",
      );
      var voucherSrc = normalizeEmbedUrl(
        modal.getAttribute("data-motion-voucher-iframe-src") || "/motion/gutschein/motion-test-gutschein.html",
      );

      var videoSrc = modal.getAttribute("data-motion-video-src") || "/videos/onroda-kunde.mp4";
      var useFinalVideo = modal.getAttribute("data-motion-use-video") === "1";
      var lastFocus = null;
      var loadTimer = null;
      var activeTab = "customer";
      if (video) {
        video.controls = false;
      }

      function srcForTab(tab) {
        if (tab === "medical") return medicalSrc;
        if (tab === "platform") return platformSrc;
        if (tab === "voucher") return voucherSrc;
        return customerSrc;
      }

      function syncFallbackLink() {
        if (!fallbackLink) return;
        fallbackLink.href = srcForTab(activeTab);
      }

      syncFallbackLink();

      function hideFallback() {
        if (fallback) fallback.hidden = true;
      }

      function showFallback(reason) {
        if (fallback) fallback.hidden = false;
        motionModalLog("[motion-modal] fallback shown:", reason || "unknown");
      }

      function clearLoadTimer() {
        if (loadTimer) {
          clearTimeout(loadTimer);
          loadTimer = null;
        }
      }

      function frameHasSize() {
        var frame = modal.querySelector(".hp-motion-frame");
        return !!(frame && frame.offsetWidth > 40 && frame.offsetHeight > 80);
      }

      function iframeLooksLoaded() {
        if (!frameHasSize() || iframe.offsetHeight < 80) return false;
        try {
          var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (!doc) return false;
          var stage = doc.querySelector("[class*='__stage']");
          return !!(stage && stage.offsetWidth > 40 && stage.offsetHeight > 80);
        } catch (err) {
          return iframe.offsetHeight >= 80;
        }
      }

      function logIframeMetrics(phase) {
        motionModalLog("[motion-modal] " + (phase || "metrics"));
        motionModalLog("[motion-modal] iframe src", iframe.src);
        motionModalLog("[motion-modal] iframe width", iframe.offsetWidth);
        motionModalLog("[motion-modal] iframe height", iframe.offsetHeight);
        motionModalLog("[motion-modal] frame width", modal.querySelector(".hp-motion-frame")?.offsetWidth);
        motionModalLog("[motion-modal] frame height", modal.querySelector(".hp-motion-frame")?.offsetHeight);
        if (typeof console !== "undefined" && typeof console.log === "function") {
          console.log("[motion-modal]", iframe.src, iframe.offsetWidth, iframe.offsetHeight);
        }
      }

      function scheduleLoadCheck() {
        clearLoadTimer();
        loadTimer = setTimeout(function () {
          logIframeMetrics("load-check");
          if (!iframeLooksLoaded()) {
            showFallback("timeout-or-empty");
          }
        }, 4500);
      }

      iframe.addEventListener("load", function () {
        clearLoadTimer();
        logIframeMetrics("iframe load");
        if (iframeLooksLoaded()) {
          hideFallback();
          return;
        }
        showFallback("empty-or-zero-size");
      });

      function closeMotionModal() {
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("hp-motion-modal-open");
        clearLoadTimer();
        hideFallback();
        iframe.src = "about:blank";
        iframe.setAttribute("title", "ONRODA Motion-Vorschau");
        if (video) {
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.hidden = true;
        }
        iframe.hidden = false;
        if (lastFocus && typeof lastFocus.focus === "function") {
          lastFocus.focus();
        }
        motionModalLog("[motion-modal] closed");
      }

      function setActiveTab(nextTab, opts) {
        var force = !!(opts && opts.forceLoad);
        var next = nextTab === "medical" || nextTab === "platform" || nextTab === "voucher" ? nextTab : "customer";
        activeTab = next;
        syncFallbackLink();

        for (var i = 0; i < tabs.length; i++) {
          var t = tabs[i];
          var isActive = t.getAttribute("data-motion-tab") === activeTab;
          t.setAttribute("aria-selected", isActive ? "true" : "false");
        }

        if (!modal.hidden || force) {
          iframe.src = srcForTab(activeTab);
          iframe.setAttribute(
            "title",
            activeTab === "medical"
              ? "ONRODA Krankenfahrt — Motion-Vorschau"
              : activeTab === "platform"
                ? "ONRODA Unternehmen — Motion-Vorschau"
                : activeTab === "voucher"
                  ? "ONRODA Gutschein — Motion-Vorschau"
                : "ONRODA Kunde — Motion-Vorschau",
          );
          hideFallback();
          scheduleLoadCheck();
        }
      }

      function openMotionModal() {
        motionModalLog("[motion-modal] open clicked");
        lastFocus = document.activeElement;
        modal.hidden = false;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("hp-motion-modal-open");
        modal.classList.toggle("hp-motion-modal--video", !!(useFinalVideo && video));
        if (typeof console !== "undefined" && typeof console.log === "function") {
          console.log("[motion-modal] mode", useFinalVideo && video ? "video" : "iframe");
        }

        if (useFinalVideo && video) {
          iframe.hidden = true;
          iframe.src = "about:blank";
          video.hidden = false;
          video.controls = false;
          video.src = videoSrc;
          video.muted = true;
          video.removeAttribute("autoplay");
        } else {
          if (video) {
            video.hidden = true;
            video.pause();
            video.removeAttribute("src");
            video.load();
          }
          iframe.hidden = false;
          hideFallback();
          setActiveTab(activeTab, { forceLoad: true });
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              logIframeMetrics("after open");
              if (!iframeLooksLoaded()) {
                showFallback("zero-height-after-open");
              }
            });
          });
        }

        var closeBtn = modal.querySelector(".hp-motion-modal__close");
        if (closeBtn) closeBtn.focus();
      }

      window.openMotionModal = openMotionModal;
      window.closeMotionModal = closeMotionModal;

      var openBtn = document.getElementById("hero-motion-open");
      if (openBtn) {
        openBtn.addEventListener("click", function (e) {
          e.preventDefault();
          openMotionModal();
        });
        motionModalLog("[motion-modal] listener on #hero-motion-open");
      } else {
        motionModalLog("[motion-modal] #hero-motion-open not found, delegation only");
      }

      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener("click", function (e) {
          var tab = e.currentTarget && e.currentTarget.getAttribute ? e.currentTarget.getAttribute("data-motion-tab") : "";
          if (!tab) return;
          setActiveTab(tab, { forceLoad: true });
        });
      }

      document.addEventListener("click", function (e) {
        var trigger =
          e.target && e.target.closest
            ? e.target.closest("#hero-motion-open, [data-motion-open]")
            : null;
        if (!trigger || trigger === openBtn) return;
        if (!document.getElementById("hp-motion-modal")) return;
        e.preventDefault();
        var tabHint = trigger.getAttribute("data-motion-open");
        if (tabHint && tabHint !== "" && tabHint !== "true") {
          activeTab = tabHint;
          setActiveTab(tabHint, { forceLoad: true });
        }
        openMotionModal();
      });

      modal.addEventListener("click", function (e) {
        var closeTrigger =
          e.target && e.target.closest
            ? e.target.closest("[data-motion-close]")
            : null;
        if (closeTrigger) {
          closeMotionModal();
        }
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !modal.hidden) {
          e.preventDefault();
          closeMotionModal();
        }
      });

      motionModalLog("[motion-modal] init ok", {
        customerSrc: customerSrc,
        medicalSrc: medicalSrc,
        platformSrc: platformSrc,
        voucherSrc: voucherSrc,
      });
    }

    initHeroMotionModal();

    function initAboutModal() {
      var modal = document.getElementById("hp-about-modal");
      if (!modal) return;

      function openAboutModal() {
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        modal.classList.add("is-open");
        document.body.classList.add("hp-motion-modal-open");
        var closeBtn = modal.querySelector(".hp-motion-modal__close");
        if (closeBtn) closeBtn.focus();
      }

      function closeAboutModal() {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        modal.classList.remove("is-open");
        document.body.classList.remove("hp-motion-modal-open");
      }

      window.openAboutModal = openAboutModal;
      window.closeAboutModal = closeAboutModal;

      document.addEventListener("click", function (e) {
        var trigger =
          e.target && e.target.closest
            ? e.target.closest("[data-about-open]")
            : null;
        if (!trigger) return;
        e.preventDefault();
        openAboutModal();
      });

      modal.addEventListener("click", function (e) {
        var closeTrigger =
          e.target && e.target.closest
            ? e.target.closest("[data-about-close]")
            : null;
        if (closeTrigger) {
          closeAboutModal();
        }
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !modal.hidden) {
          e.preventDefault();
          closeAboutModal();
        }
      });
    }

    initAboutModal();

    function initAppDownloadReveal() {
      var section = document.querySelector(".hp-app-download");
      if (!section) {
        marketingDevLog("[onroda] app-download reveal: .hp-app-download not found, skip");
        return;
      }

      var reveals = section.querySelectorAll("[data-reveal-order]");
      for (var i = 0; i < reveals.length; i++) {
        var order = reveals[i].getAttribute("data-reveal-order");
        if (order != null) {
          reveals[i].style.setProperty("--reveal-order", order);
        }
      }

      function activate(source) {
        section.classList.add("is-visible");
        marketingDevLog("[onroda] app-download reveal: visible (" + (source || "unknown") + ")");
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        activate("reduced-motion");
        return;
      }
      if (!("IntersectionObserver" in window)) {
        activate("no-intersection-observer");
        return;
      }

      var observer = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              activate("intersection");
              observer.disconnect();
              return;
            }
          }
        },
        { threshold: 0.16, rootMargin: "0px 0px -6% 0px" },
      );
      observer.observe(section);
      marketingDevLog("[onroda] app-download reveal: observer attached");
    }

    initAppDownloadReveal();

    function initAppDownloadTabs() {
      var section = document.querySelector(".hp-app-download");
      if (!section) return;
      var tabs = section.querySelectorAll("[data-app-tab]");
      if (!tabs.length) return;

      function setTab(next) {
        var tab = next === "medical" || next === "partner" ? next : "taxi";
        section.setAttribute("data-app-active-tab", tab);
        for (var i = 0; i < tabs.length; i++) {
          var btn = tabs[i];
          var active = btn.getAttribute("data-app-tab") === tab;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-selected", active ? "true" : "false");
        }
      }

      for (var j = 0; j < tabs.length; j++) {
        tabs[j].addEventListener("click", function () {
          setTab(this.getAttribute("data-app-tab"));
        });
      }
    }

    initAppDownloadTabs();

    function syncPartnerTaxiSection() {
      var wrap = document.getElementById("partner-taxi-fields");
      var ct = document.getElementById("companyType");
      if (!wrap || !ct) return;
      if (ct.value === "taxi") {
        wrap.removeAttribute("hidden");
      } else {
        wrap.setAttribute("hidden", "hidden");
      }
    }

    var companyTypeForTaxi = document.getElementById("companyType");
    if (companyTypeForTaxi) {
      companyTypeForTaxi.addEventListener("change", syncPartnerTaxiSection);
      syncPartnerTaxiSection();
    }

    var TAXI_DOC_MAX_BYTES = 4 * 1024 * 1024;

    function readPartnerPdfFileBase64(file) {
      return new Promise(function (resolve, reject) {
        if (!file || !file.size) {
          resolve(null);
          return;
        }
        if (file.size > TAXI_DOC_MAX_BYTES) {
          reject({ code: "too_large" });
          return;
        }
        var nameOk = /\.pdf$/i.test(file.name || "");
        var typeOk = !file.type || file.type === "application/pdf";
        if (!nameOk || !typeOk) {
          reject({ code: "not_pdf" });
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var r = reader.result;
          if (typeof r !== "string") {
            reject({ code: "read_failed" });
            return;
          }
          var comma = r.indexOf(",");
          var b64 = comma >= 0 ? r.slice(comma + 1) : r;
          resolve({ fileName: file.name, mimeType: "application/pdf", contentBase64: b64 });
        };
        reader.onerror = function () {
          reject({ code: "read_failed" });
        };
        reader.readAsDataURL(file);
      });
    }

    function buildTaxiDocumentsForSubmit() {
      var concEl = document.getElementById("taxi-doc-concession");
      var gewEl = document.getElementById("taxi-doc-gewerbe");
      var insEl = document.getElementById("taxi-doc-insurance");
      var concFile = concEl && concEl.files && concEl.files[0];
      var gewFile = gewEl && gewEl.files && gewEl.files[0];
      var insFile = insEl && insEl.files && insEl.files[0];
      if (!concFile) {
        return Promise.reject({ code: "no_concession" });
      }
      return readPartnerPdfFileBase64(concFile).then(function (conc) {
        if (!conc) return Promise.reject({ code: "no_concession" });
        return Promise.all([
          Promise.resolve(conc),
          gewFile ? readPartnerPdfFileBase64(gewFile) : Promise.resolve(null),
          insFile ? readPartnerPdfFileBase64(insFile) : Promise.resolve(null),
        ]).then(function (parts) {
          var out = { concession: parts[0] };
          if (parts[1]) out.gewerbe = parts[1];
          if (parts[2]) out.insurance = parts[2];
          return out;
        });
      });
    }

    function fieldTrim(id) {
      var el = document.getElementById(id);
      return el ? String(el.value || "").trim() : "";
    }

    var partnerForm = document.getElementById("partner-form");
    if (partnerForm) {
      partnerForm.addEventListener("submit", function (e) {
        e.preventDefault();

        var msgEl = document.getElementById("partner-form-message");
        var submitBtn = document.getElementById("partner-form-submit");
        var privacy = document.getElementById("privacyAccept");

        function setMessage(text, kind) {
          if (!msgEl) return;
          msgEl.textContent = text || "";
          msgEl.className = "hp-form-status" + (kind ? " hp-form-status--" + kind : "");
        }

        var companyTypeEl = document.getElementById("companyType");
        var partnerType = (companyTypeEl && companyTypeEl.value ? companyTypeEl.value : "").trim();
        var companyTypeLabel = "";
        if (companyTypeEl && companyTypeEl.options && companyTypeEl.selectedIndex >= 0) {
          companyTypeLabel = (companyTypeEl.options[companyTypeEl.selectedIndex].text || "").trim();
        }
        var companyName = document.getElementById("companyName").value.trim();
        var firstName = document.getElementById("firstName").value.trim();
        var lastName = document.getElementById("lastName").value.trim();
        var businessEmail = document.getElementById("businessEmail").value.trim();
        var businessPhone = document.getElementById("businessPhone").value.trim();
        var address = document.getElementById("address").value.trim();
        var postalCode = document.getElementById("postalCode").value.trim();
        var city = document.getElementById("city").value.trim();
        var country = document.getElementById("country").value.trim();
        var region = document.getElementById("region").value.trim();
        var notes = document.getElementById("notes").value.trim();
        var hpEl = document.getElementById("partner-hp-company-website");
        var hpVal = hpEl ? String(hpEl.value || "").trim() : "";

        setMessage("");

        if (!privacy || !privacy.checked) {
          setMessage("Bitte bestätigen Sie die Kenntnisnahme der Datenschutzhinweise.", "error");
          return;
        }
        if (!partnerType) {
          setMessage("Bitte wählen Sie die Art Ihres Unternehmens.", "error");
          return;
        }
        if (hpVal) {
          setMessage("Die Anfrage konnte nicht gesendet werden.", "error");
          return;
        }

        var usesVouchersEl = document.getElementById("usesVouchers");
        var usesVouchers = !!(usesVouchersEl && usesVouchersEl.checked);

        var ownerName = fieldTrim("ownerName");
        var concessionNumber = fieldTrim("concessionNumber");
        var taxId = fieldTrim("taxId");
        var vatId = fieldTrim("vatId");
        var addressLine2 = fieldTrim("addressLine2");
        var dispoPhone = fieldTrim("dispoPhone");

        if (partnerType === "taxi") {
          if (!concessionNumber) {
            setMessage("Bitte die Konzessionsnummer angeben (Pflicht für Taxiunternehmen).", "error");
            return;
          }
          if (!taxId || !vatId) {
            setMessage("Bitte Steuernummer und USt-IdNr. angeben (Pflicht für Taxiunternehmen).", "error");
            return;
          }
          if (!ownerName) {
            setMessage("Bitte den Inhaber / die inhabende Person angeben (Pflicht für Taxiunternehmen).", "error");
            return;
          }
        }

        var notesParts = [];
        if (notes) notesParts.push(notes);
        var combinedNotes = notesParts.join("\n\n");

        function sendPartnerRegistration(taxiDocuments) {
          var payload = {
            hp_company_website: "",
            companyName: companyName,
            legalForm: companyTypeLabel || partnerType,
            partnerType: partnerType,
            usesVouchers: usesVouchers,
            contactFirstName: firstName,
            contactLastName: lastName,
            email: businessEmail,
            phone: businessPhone,
            addressLine1: address,
            addressLine2: addressLine2,
            ownerName: ownerName,
            dispoPhone: dispoPhone,
            postalCode: postalCode,
            city: city,
            country: country,
            taxId: taxId,
            vatId: vatId,
            concessionNumber: concessionNumber,
            desiredRegion: region,
            requestedUsage: {},
            documentsMeta: {},
            notes: combinedNotes,
          };
          if (taxiDocuments) payload.taxiDocuments = taxiDocuments;

          if (submitBtn) submitBtn.disabled = true;
          var url = publicApiBase() + "/panel-auth/registration-request";

          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { res: res, data: data };
              });
            })
            .then(function (x) {
              var res = x.res;
              var data = x.data || {};
              if (res.status === 201 && data.ok && data.request && data.request.id) {
                var origin =
                  typeof window !== "undefined" && window.location.origin
                    ? window.location.origin
                    : "https://www.onroda.de";
                var statusUrl =
                  origin +
                  "/partner/anfrage-status?requestId=" +
                  encodeURIComponent(data.request.id) +
                  "&email=" +
                  encodeURIComponent(businessEmail);
                setMessage(
                  "Vielen Dank — Ihre Anfrage ist eingegangen (Referenz: " +
                    data.request.id +
                    "). Wir melden uns per E-Mail.\n\n" +
                    "Status jederzeit prüfen:\n" +
                    statusUrl,
                  "success",
                );
                partnerForm.reset();
                if (privacy) privacy.checked = false;
                syncPartnerTaxiSection();
                return;
              }
              if (res.status === 429) {
                var sec = data.retryAfterSec ? String(data.retryAfterSec) : "einige";
                setMessage("Zu viele Anfragen. Bitte warten Sie " + sec + " Sekunden und versuchen Sie es erneut.", "error");
                return;
              }
              if (res.status === 409) {
                if (data.error === "duplicate_pending") {
                  setMessage(
                    "Zu dieser E-Mail liegt bereits eine offene Anfrage vor. Sie erhalten von uns eine Rückmeldung — bitte keine Doppelanfrage.",
                    "error",
                  );
                  return;
                }
                if (data.error === "duplicate_approved") {
                  setMessage(
                    "Zu dieser E-Mail existiert bereits eine freigegebene Registrierung. Bitte nutzen Sie das Partner-Portal oder kontaktieren Sie uns.",
                    "error",
                  );
                  return;
                }
                if (data.error === "already_panel_user") {
                  setMessage(
                    "Zu dieser E-Mail existiert bereits ein Partner-Portal-Zugang. Bitte dort anmelden.",
                    "error",
                  );
                  return;
                }
              }
              if (res.status === 400 && data.error === "required_fields_missing") {
                setMessage("Bitte füllen Sie alle Pflichtfelder aus.", "error");
                return;
              }
              if (res.status === 400 && data.error === "partner_type_invalid") {
                setMessage("Ungültige Auswahl bei der Art des Unternehmens.", "error");
                return;
              }
              if (res.status === 503 && data.error === "document_persist_failed") {
                var ref = data.requestId ? " Referenz: " + String(data.requestId) + "." : "";
                setMessage((data.hint ? data.hint : "Dokument konnte nicht gespeichert werden.") + ref, "error");
                return;
              }
              if (res.status === 400 && data.hint) {
                setMessage(data.hint, "error");
                return;
              }
              setMessage("Die Anfrage konnte nicht gesendet werden. Bitte später erneut versuchen oder uns per E-Mail kontaktieren.", "error");
            })
            .catch(function () {
              setMessage("Netzwerkfehler — bitte prüfen Sie Ihre Verbindung oder versuchen Sie es später erneut.", "error");
            })
            .finally(function () {
              if (submitBtn) submitBtn.disabled = false;
            });
        }

        if (partnerType === "taxi") {
          buildTaxiDocumentsForSubmit()
            .then(function (taxiDocuments) {
              sendPartnerRegistration(taxiDocuments);
            })
            .catch(function (err) {
              var code = err && err.code ? err.code : "";
              if (code === "no_concession") {
                setMessage("Bitte die Konzession als PDF hochladen (Pflicht).", "error");
                return;
              }
              if (code === "not_pdf") {
                setMessage("Nur PDF-Dateien sind erlaubt.", "error");
                return;
              }
              if (code === "too_large") {
                setMessage("Jede PDF-Datei darf höchstens 4 MB groß sein.", "error");
                return;
              }
              setMessage("Die Unterlagen konnten nicht gelesen werden. Bitte erneut versuchen.", "error");
            });
        } else {
          sendPartnerRegistration(null);
        }
      });
    }
