    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    window.addEventListener("load", function () {
      window.scrollTo(0, 0);
    });

    document.getElementById("y").textContent = new Date().getFullYear();

    document.getElementById("partner-form").addEventListener("submit", function (e) {
      e.preventDefault();

      var companyType = document.getElementById("companyType").value.trim();
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

      var body = [
        "Partneranfrage ONRODA",
        "",
        "Art des Unternehmens: " + companyType,
        "Unternehmensname: " + companyName,
        "Ansprechpartner Vorname: " + firstName,
        "Ansprechpartner Nachname: " + lastName,
        "Geschäftliche E-Mail: " + businessEmail,
        "E-Mail für Rückmeldung: " + customerEmail,
        "Geschäftliche Telefonnummer: " + businessPhone,
        "Adresse: " + address,
        "PLZ: " + postalCode,
        "Stadt: " + city,
        "Land: " + country,
        "Einsatzbereich / Region: " + region,
        "Hinweise: " + notes
      ].join("\n");

      window.location.href =
        "mailto:onroda@mail.de?subject=" +
        encodeURIComponent("ONRODA Partneranfrage") +
        "&body=" +
        encodeURIComponent(body);
    });
