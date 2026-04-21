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
          usesVouchers: false,
          contactFirstName: firstName,
          contactLastName: lastName,
          email: businessEmail,
          phone: businessPhone,
          addressLine1: address,
          postalCode: postalCode,
          city: city,
          country: country,
          taxId: "",
          vatId: "",
          concessionNumber: "",
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
