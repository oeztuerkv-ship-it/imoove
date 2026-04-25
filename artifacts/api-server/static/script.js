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

    function dismissedKey(key) {
      return "onroda.homepage.dismissed." + String(key || "");
    }

    function isDismissed(key) {
      if (!key) return false;
      try {
        return window.localStorage.getItem(dismissedKey(key)) === "1";
      } catch {
        return false;
      }
    }

    function markDismissed(key) {
      if (!key) return;
      try {
        window.localStorage.setItem(dismissedKey(key), "1");
      } catch {
        // ignore storage errors
      }
    }

    function toneClass(tone) {
      var raw = String(tone || "info").toLowerCase();
      if (raw === "warning" || raw === "success" || raw === "neutral") return raw;
      return "info";
    }

    function buildPlaceholderNode(item) {
      var wrap = document.createElement("article");
      wrap.className = "hp-dynamic-placeholder hp-dynamic-placeholder--" + toneClass(item.tone);
      var top = document.createElement("div");
      top.className = "hp-dynamic-placeholder__top";
      var title = document.createElement("h3");
      title.className = "hp-dynamic-placeholder__title";
      title.textContent = String(item.title || "Hinweis");
      top.appendChild(title);

      var closeBtn = document.createElement("button");
      closeBtn.className = "hp-dynamic-placeholder__close";
      closeBtn.setAttribute("type", "button");
      closeBtn.setAttribute("aria-label", "Hinweis ausblenden");
      closeBtn.textContent = "X";
      closeBtn.addEventListener("click", function () {
        var key = item.dismissKey || item.id;
        markDismissed(key);
        wrap.remove();
      });
      top.appendChild(closeBtn);
      wrap.appendChild(top);

      var msg = document.createElement("p");
      msg.className = "hp-dynamic-placeholder__msg";
      msg.textContent = String(item.message || "");
      wrap.appendChild(msg);

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

      return wrap;
    }

    function loadDynamicHomepagePlaceholders() {
      var host = window.location.hostname;
      if (host !== "onroda.de" && host !== "www.onroda.de" && host !== "localhost" && host !== "127.0.0.1") {
        return;
      }
      var target = document.getElementById("hp-dynamic-placeholders");
      if (!target) return;
      var url = "https://api.onroda.de/api/public/homepage-placeholders";
      fetch(url, { method: "GET", credentials: "omit" })
        .then(function (res) {
          if (!res.ok) return { ok: false, items: [] };
          return res.json().catch(function () { return { ok: false, items: [] }; });
        })
        .then(function (data) {
          if (!data || !data.ok || !Array.isArray(data.items)) return;
          target.innerHTML = "";
          data.items.forEach(function (item) {
            var dismissId = item.dismissKey || item.id;
            if (isDismissed(dismissId)) return;
            target.appendChild(buildPlaceholderNode(item));
          });
        })
        .catch(function () {
          // keep homepage usable when endpoint is unavailable
        });
    }

    loadDynamicHomepagePlaceholders();

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
