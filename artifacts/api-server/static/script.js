    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    window.addEventListener("load", function () {
      window.scrollTo(0, 0);
    });

    document.addEventListener("click", function (e) {
      var details = document.querySelector(".hp-topbar-about");
      if (!details) return;
      if (!details.contains(e.target)) {
        details.removeAttribute("open");
      }
    });

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

    function toneClass(tone) {
      var raw = String(tone || "info").toLowerCase();
      if (raw === "warning" || raw === "success" || raw === "neutral") return raw;
      return "info";
    }

    function setMultilineText(target, text) {
      if (!target) return;
      var s = String(text || "");
      target.innerHTML = "";
      var parts = s.split(/\r?\n/);
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) target.appendChild(document.createElement("br"));
        target.appendChild(document.createTextNode(parts[i]));
      }
    }

    function buildPlaceholderNode(item) {
      var wrap = document.createElement("article");
      wrap.className = "hp-dynamic-placeholder hp-dynamic-placeholder--" + toneClass(item.tone);
      var line = document.createElement("p");
      line.className = "hp-dynamic-placeholder__line";

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

    function loadHomepageHints() {
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
          if (!items.length) return;
          noticeRoot.innerHTML = "";
          if (!noticeRoot.classList.contains("hp-dynamic-placeholders")) {
            noticeRoot.classList.add("hp-dynamic-placeholders");
          }
          noticeRoot.setAttribute("aria-live", "polite");
          for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (hintDismissed(item)) continue;
            noticeRoot.appendChild(buildPlaceholderNode(item));
          }
        })
        .catch(function () {
          // keep homepage usable when endpoint is unavailable
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
      var noticeRoot = document.getElementById("homepage-placeholders-root");
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
            setMultilineText(headlineEl, item && item.heroHeadline ? item.heroHeadline : defaultHeadline);
          }
          if (sublineEl) {
            sublineEl.textContent = (item && item.heroSubline ? item.heroSubline : defaultSubline).trim();
          }
          if (cta1El) {
            cta1El.textContent = (item && item.cta1Text ? item.cta1Text : defaultCta1Text).trim();
            cta1El.setAttribute("href", (item && item.cta1Link ? item.cta1Link : defaultCta1Link) || "#jetzt-buchen");
          }
          if (cta2El) {
            cta2El.textContent = (item && item.cta2Text ? item.cta2Text : defaultCta2Text).trim();
            cta2El.setAttribute("href", (item && item.cta2Link ? item.cta2Link : defaultCta2Link) || "#services");
          }
          if (noticeRoot) {
            noticeRoot.innerHTML = "";
            if (item && item.noticeActive && String(item.noticeText || "").trim()) {
              if (!noticeRoot.classList.contains("hp-dynamic-placeholders")) {
                noticeRoot.classList.add("hp-dynamic-placeholders");
              }
              noticeRoot.setAttribute("aria-live", "polite");
              noticeRoot.appendChild(
                buildPlaceholderNode({
                  tone: "info",
                  message: String(item.noticeText || ""),
                  title: "Hinweis",
                }),
              );
            }
          }
          if (section2TitleEl) {
            section2TitleEl.textContent = (item && item.section2Title ? item.section2Title : defaultSection2Title).trim();
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
            iconEl.textContent = String(c && c.icon ? c.icon : defaultIcon);
            titleEl.textContent = String(c && c.title ? c.title : defaultTitle);
            bodyEl.textContent = String(c && c.body ? c.body : defaultBody);
            ctaEl.textContent = String(c && c.ctaText ? c.ctaText : defaultCtaText);
            ctaEl.setAttribute("href", String(c && c.ctaLink ? c.ctaLink : defaultCtaHref));
          }
          var servicesKickerEl = document.getElementById("services-kicker");
          var servicesTitleEl = document.getElementById("services-title");
          var servicesSubEl = document.getElementById("services-sub");
          var defaultSk = servicesKickerEl ? servicesKickerEl.textContent || "" : "";
          var defaultSt = servicesTitleEl ? servicesTitleEl.textContent || "" : "";
          var defaultSs = servicesSubEl ? servicesSubEl.textContent || "" : "";
          if (servicesKickerEl) {
            servicesKickerEl.textContent = (item && item.servicesKicker ? item.servicesKicker : defaultSk).trim();
          }
          if (servicesTitleEl) {
            servicesTitleEl.textContent = (item && item.servicesTitle ? item.servicesTitle : defaultSt).trim();
          }
          if (servicesSubEl) {
            servicesSubEl.textContent = (item && item.servicesSubline ? item.servicesSubline : defaultSs).trim();
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
            scIcon.textContent = String(sc && sc.icon ? sc.icon : dIcon);
            scTitle.textContent = String(sc && sc.title ? sc.title : dTitle);
            scBody.textContent = String(sc && sc.body ? sc.body : dBody);
          }
          var manKEl = document.getElementById("manifest-kicker");
          var manTitleEl = document.getElementById("manifest-title");
          var manSubEl = document.getElementById("manifest-sub");
          var dMk = manKEl ? manKEl.textContent || "" : "";
          var dMt = manTitleEl ? manTitleEl.textContent || "" : "";
          var dMs = manSubEl ? manSubEl.textContent || "" : "";
          if (manKEl) {
            manKEl.textContent = (item && item.manifestKicker ? item.manifestKicker : dMk).trim();
          }
          if (manTitleEl) {
            manTitleEl.textContent = (item && item.manifestTitle ? item.manifestTitle : dMt).trim();
          }
          if (manSubEl) {
            manSubEl.textContent = (item && item.manifestSubline ? item.manifestSubline : dMs).trim();
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
            mIcon.textContent = String(mc && mc.icon ? mc.icon : dMI);
            mTit.textContent = String(mc && mc.title ? mc.title : dMTi);
            mBody.textContent = String(mc && mc.body ? mc.body : dMBo);
            mCta.textContent = String(mc && mc.ctaText ? mc.ctaText : dMCt);
            mCta.setAttribute("href", String(mc && mc.ctaLink ? mc.ctaLink : dMCh));
          }
        })
        .catch(function () {
          // keep homepage usable when endpoint is unavailable
        });
    }

    function loadHomepageModules() {
      var host = window.location.hostname;
      if (host !== "onroda.de" && host !== "www.onroda.de" && host !== "localhost" && host !== "127.0.0.1") {
        return;
      }
      fetch(publicApiBase() + "/public/homepage-how", { method: "GET", credentials: "omit" })
        .then(function (r) {
          if (!r.ok) return { ok: false, items: [] };
          return r.json().catch(function () { return { ok: false, items: [] }; });
        })
        .then(function (j) {
          var items = j && j.ok && Array.isArray(j.items) ? j.items : [];
          for (var i = 1; i <= 3; i++) {
            var wrap = document.getElementById("how-card-" + i);
            var icon = document.getElementById("how-card-" + i + "-icon");
            var title = document.getElementById("how-card-" + i + "-title");
            var body = document.getElementById("how-card-" + i + "-body");
            if (!wrap || !icon || !title || !body) continue;
            var dIcon = icon.textContent || "";
            var dTitle = title.textContent || "";
            var dBody = body.textContent || "";
            var it = items[i - 1] || null;
            var active = it ? it.isActive !== false : true;
            if (!active) {
              wrap.setAttribute("hidden", "hidden");
              continue;
            }
            wrap.removeAttribute("hidden");
            icon.textContent = String(it && it.icon ? it.icon : dIcon);
            title.textContent = String(it && it.title ? it.title : dTitle);
            body.textContent = String(it && it.body ? it.body : dBody);
          }
        })
        .catch(function () {});

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
            value.textContent = String(it && it.value ? it.value : dVal);
            label.textContent = String(it && it.label ? it.label : dLbl);
            desc.textContent = String(it && it.description ? it.description : dDesc);
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
            q.textContent = String(it && it.question ? it.question : dQ);
            a.textContent = String(it && it.answer ? it.answer : dA);
          }
        })
        .catch(function () {});
    }

    loadHomepageHints();
    loadHomepageContent();
    loadHomepageModules();

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
        var customerEmail = document.getElementById("customerEmail").value.trim();
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
        if (customerEmail && customerEmail.toLowerCase() !== businessEmail.toLowerCase()) {
          notesParts.push("Weitere Kontakt-E-Mail: " + customerEmail);
        }
        var combinedNotes = notesParts.join("\n\n");

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
      });
    }
