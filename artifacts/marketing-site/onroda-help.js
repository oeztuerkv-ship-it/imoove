/* Self-hosted FAQ helper. No AI service, network calls, storage or booking actions. */
(function () {
  "use strict";
  var faq = [
    { id: "price", question: "Was kostet meine Fahrt?", terms: ["preis", "preise", "wie viel", "wieviel", "euro", "gunstig", "billig", "kosten", "kostet", "teuer", "pauschal", "festpreis", "tarif", "taxameter"], answer: "Der Fahrpreis hängt von Strecke, Fahrzeug und Preismodell ab. Im ONRODA-Preisrechner kannst du prüfen, ob für deine Strecke ein Pauschalpreis verfügbar ist. Hier im Hilfe-Chat wird kein Fahrpreis berechnet oder zugesagt.", href: "/fixpreise/#fixpreis-calculator", link: "Strecke und Preis prüfen" },
    { id: "flight", question: "Flugnummer oder Verspätung?", terms: ["flugnummer", "flug nummer", "verspatung", "verspaetung", "verspatet", "landet", "landung", "flug gestrichen", "flug andert", "ankunftszeit", "abflugzeit"], answer: "Teile uns deine Flugnummer, den Reisetag und die gewünschte Abholzeit bitte per WhatsApp mit. Auch Verspätungen und Änderungen stimmen wir dort mit dir ab. Dieser Chat kann keine Flüge live überwachen oder eine vorhandene Buchung ändern.", href: "https://wa.me/4917684229016", link: "Flugdaten per WhatsApp besprechen" },
    { id: "vehicle", question: "VIP oder E-Klasse möglich?", terms: ["vip", "e klasse", "eclass", "mercedes", "luxus", "premium", "fahrzeugwunsch", "kombi", "limousine", "business fahrzeug", "business class", "vipfahrzeug", "luxusfahrzeug"], answer: "Einen besonderen Fahrzeugwunsch, zum Beispiel eine schwarze E-Klasse als Kombi, kannst du persönlich anfragen. Welches Modell verfügbar ist und ob dein Wunsch erfüllt werden kann, bestätigt dir unser Team. Eine VIP-Kategorie oder ein bestimmtes Fahrzeug wird hier nicht garantiert.", href: "https://wa.me/4917684229016", link: "Fahrzeugwunsch anfragen" },
    { id: "airport", question: "Wie buche ich einen Flughafentransfer?", terms: ["flughafen", "airport", "transfer", "terminal", "treffpunkt", "abholen am flughafen"], answer: "Flughafentransfers kannst du über ONRODA anfragen. Prüfe deine Strecke im Preisrechner und buche anschließend in der App. Den genauen Treffpunkt und besondere Abholwünsche klärst du bei der Anfrage. Eine konkrete Fahrer-Verfügbarkeit muss für deine Fahrt bestätigt werden.", href: "/fixpreise/", link: "Zum Flughafentransfer" },
    { id: "booking", question: "Wie bestelle ich ein Taxi?", terms: ["taxi", "taxifahrt", "taxibestellung", "buchen", "bestellen", "fahrt anfragen", "brauche eine fahrt", "will fahren"], answer: "Fahrten kannst du in der ONRODA App anfragen oder vorplanen. Wenn du vorab eine persönliche Frage hast, erreichst du uns über WhatsApp. Dieser Hilfe-Chat nimmt selbst keine Buchung vor.", href: "/#jetzt-buchen", link: "Zur ONRODA App" },
    { id: "luggage", question: "Wie viele Personen und Koffer passen?", terms: ["koffer", "gepack", "gepaeck", "personen", "passagiere", "grossraum", "xl", "kinderwagen", "viel platz", "sitzplatze"], answer: "Bitte gib bei der Anfrage die Anzahl der Personen und die Menge deines Gepäcks an. Für viele Koffer, einen Kinderwagen oder größere Gruppen klärt unser Team das passende Fahrzeug mit dir. Die Kapazität hängt vom tatsächlich angebotenen Fahrzeug ab.", href: "https://wa.me/4917684229016", link: "Personen und Gepäck abstimmen" },
    { id: "child", question: "Kann ich einen Kindersitz anfragen?", terms: ["kindersitz", "babyschale", "sitzerhohung", "sitzerhoehung", "baby", "kleinkind"], answer: "Teile einen benötigten Kindersitz bitte vorab persönlich mit. Ob ein passender Sitz gestellt werden kann, muss das Team für deine Anfrage bestätigen. Dieser Chat kann keine Ausstattung reservieren.", href: "https://wa.me/4917684229016", link: "Kindersitz persönlich anfragen" },
    { id: "reservation", question: "Kann ich vorbestellen?", terms: ["vorbestellen", "vorbestellung", "reservieren", "reservierung", "morgen", "fruh", "frueh", "nachts", "uhrzeit", "termin"], answer: "Du kannst Fahrten in der ONRODA App für einen späteren Zeitpunkt planen. Gib Abholort, Ziel und gewünschten Zeitpunkt an. Maßgeblich ist die Bestätigung deiner Anfrage; dieser Chat kann keine Fahrt oder Abholzeit verbindlich bestätigen.", href: "/#jetzt-buchen", link: "Fahrt in der App planen" },
    { id: "region", question: "Wo vermittelt ONRODA?", terms: ["gebiet", "region", "verfugbar", "verfuegbar", "baden wurttemberg", "baden wuerttemberg", "esslingen", "stuttgart", "leinfelden", "echterdingen", "filderstadt", "deutschland"], answer: "ONRODA vermittelt Fahrten in Stuttgart, Esslingen, Leinfelden-Echterdingen und ganz Baden-Württemberg. Ob für deinen Abholort und Zeitpunkt ein Fahrzeug verfügbar ist, ergibt sich aus deiner konkreten Anfrage. Weitere Strecken kannst du persönlich mit uns besprechen.", href: "https://wa.me/4917684229016", link: "Abholort persönlich klären" },
    { id: "care", question: "Wie funktionieren Krankenfahrten?", terms: ["krankenfahrt", "dialyse", "arzt", "reha", "transportschein", "verordnung", "krankenkasse", "rollstuhl"], answer: "ONRODA unterstützt die Organisation von Krankenfahrten und die Erfassung der benötigten Unterlagen. Gib Rollstuhl- oder Sonderbedarf bei der Anfrage an. Eine Kostenübernahme oder Genehmigung durch die Krankenkasse kann dieser Chat nicht prüfen oder bestätigen.", href: "/#care", link: "Informationen zu Krankenfahrten" },
    { id: "business", question: "Gibt es Geschäfts- und Firmenfahrten?", terms: ["geschaftsreise", "geschaeftsreise", "firma", "firmen", "unternehmen", "hotel", "kostenstelle", "gutschein", "partner", "rechnung", "firmenrechnung", "sammelrechnung"], answer: "ONRODA bietet Angebote für Unternehmen, Hotels und Reisepartner mit Codes, Kostenstellen und digitaler Abrechnung. Ein Partner-Zugang erfolgt nach Prüfung und Freigabe. Welche Abrechnung für dich möglich ist, klärt das Team mit dir.", href: "/#unternehmen", link: "Angebote für Unternehmen" },
    { id: "payment", question: "Wie kann ich bezahlen?", terms: ["bezahlen", "zahlung", "bar", "kreditkarte", "kartenzahlung", "apple pay", "google pay", "beleg", "quittung"], answer: "Die für deine Fahrt verfügbaren Zahlungsarten und das Preismodell findest du bei der Buchung in der App. Fahrtinformationen und Belege werden digital bereitgestellt. Für Firmen- und Code-Fahrten gelten die vereinbarten Partnerbedingungen.", href: "/#jetzt-buchen", link: "Buchung und Zahlung in der App" },
    { id: "cancel", question: "Wie storniere ich eine Fahrt?", terms: ["stornieren", "storno", "absagen", "abbrechen", "anderung", "aenderung", "umbuchen"], answer: "Eine bestehende Fahrt verwaltest du in der App. Ob eine Stornierung möglich ist und welche Kosten angezeigt werden, hängt von Fahrtstatus und Buchungsbedingungen ab. Dieser Hilfe-Chat kann keine Fahrt stornieren, umbuchen oder Gebühren erlassen.", href: "https://wa.me/4917684229016", link: "Bei Rückfragen persönlich melden" },
    { id: "tracking", question: "Wo ist mein Fahrer?", terms: ["wo ist mein fahrer", "fahrer standort", "live tracking", "wo bleibt", "fahrer unterwegs", "wann kommt", "ankunft"], answer: "Den Fahrerstatus und verfügbare Ankunftsinformationen siehst du in deiner aktiven Fahrt in der ONRODA App. Dieser Hilfe-Chat hat keinen Zugriff auf deine Buchung oder Live-Standorte. Wenn etwas nicht passt, melde dich bitte persönlich.", href: "/#jetzt-buchen", link: "Zur ONRODA App" },
    { id: "contact", question: "Wie erreiche ich euch?", terms: ["kontakt", "erreiche", "erreichen", "anschreiben", "telefon", "whatsapp", "fundsache", "verloren", "vergessen", "beschwerde", "hilfe", "support"], answer: "Für persönliche Anliegen, besondere Wünsche oder Rückfragen zu einer Fahrt erreichst du ONRODA über WhatsApp. Dieser Hilfe-Chat beantwortet allgemeine Fragen und kann keine individuellen Buchungsdaten einsehen.", href: "https://wa.me/4917684229016", link: "ONRODA per WhatsApp kontaktieren" }
  ];
  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function findAnswers(value) {
    var query = " " + normalize(value).slice(0, 400) + " ";
    var matches = faq.map(function (item, index) {
      var score = item.terms.reduce(function (sum, term) {
        var token = normalize(term);
        // Match complete words/phrases, not 'bar' inside unrelated words.
        var hit = query.indexOf(" " + token + " ") >= 0;
        if (!hit && token.length >= 7 && token.indexOf(" ") < 0) {
          hit = query.trim().split(/\s+/).some(function (word) { return word.indexOf(token) === 0; });
        }
        return sum + (hit ? (token.indexOf(" ") >= 0 ? 3 : 1) : 0);
      }, 0);
      return { item: item, score: score, index: index };
    }).filter(function (match) { return match.score > 0; });
    if (matches.some(function (match) { return match.item.id !== "booking"; })) {
      matches = matches.filter(function (match) { return match.item.id !== "booking"; });
    }
    return matches.sort(function (a, b) { return b.score - a.score || a.index - b.index; }).slice(0, 2).map(function (match) { return match.item; });
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { faq: faq, normalize: normalize, findAnswers: findAnswers };
  if (typeof document === "undefined" || !document.body || document.getElementById("onroda-help-toggle")) return;
  var root = document.createElement("div");
  root.className = "onroda-help";
  root.innerHTML = '<button type="button" class="onroda-help__toggle" id="onroda-help-toggle" aria-label="ONRODA Fragen und Antworten öffnen" aria-controls="onroda-help-panel" aria-expanded="false" title="Fragen &amp; Antworten"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-4 3V11.5a10 10 0 0 1 20 0Z" transform="translate(1 -2) scale(.92)"/><path d="M9.5 8a2.5 2.5 0 0 1 5 .3c0 1.8-2.5 2-2.5 3.7M12 15.5h.01"/></svg></button><section class="onroda-help__panel" id="onroda-help-panel" role="dialog" aria-modal="false" aria-labelledby="onroda-help-title" hidden><header class="onroda-help__header"><div><h2 id="onroda-help-title">ONRODA Hilfe</h2><p>Fragen zu Fahrten &amp; Transfers</p></div><button type="button" class="onroda-help__close" aria-label="Hilfe schließen">×</button></header><div class="onroda-help__messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Fragen und Antworten"></div><div class="onroda-help__topics" aria-label="Häufige Themen"></div><form class="onroda-help__form"><label for="onroda-help-input">Deine Frage</label><div><input id="onroda-help-input" name="question" type="text" maxlength="400" aria-label="Deine Frage" autocomplete="off" placeholder="Zum Beispiel: Flugnummer angeben?" required /><button type="submit">Senden</button></div></form><p class="onroda-help__note">Allgemeine Antworten · keine Buchungsbestätigung</p></section>';
  document.body.appendChild(root);
  var toggle = root.querySelector(".onroda-help__toggle");
  var panel = root.querySelector(".onroda-help__panel");
  var close = root.querySelector(".onroda-help__close");
  var messages = root.querySelector(".onroda-help__messages");
  var topics = root.querySelector(".onroda-help__topics");
  var form = root.querySelector(".onroda-help__form");
  var input = root.querySelector("input");
  function addMessage(text, user, item) {
    var row = document.createElement("div");
    row.className = "onroda-help__message" + (user ? " onroda-help__message--user" : "");
    var p = document.createElement("p"); p.textContent = text; row.appendChild(p);
    if (item) {
      var link = document.createElement("a"); link.href = item.href; link.textContent = item.link;
      if (item.href.indexOf("https://wa.me/") === 0) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      row.appendChild(link);
    }
    messages.appendChild(row);
    while (messages.children.length > 32) messages.removeChild(messages.firstElementChild);
    messages.scrollTop = messages.scrollHeight;
  }
  function setOpen(open) {
    panel.hidden = !open; toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) input.focus(); else toggle.focus();
  }
  function reply(question, topicId) {
    question = String(question || "").trim().slice(0, 400); if (!question) return;
    addMessage(question, true); input.value = "";
    if (/^(hallo|hi|hey|guten tag|guten morgen|guten abend)[ !.]*$/i.test(question)) { addMessage("Hallo! Frag mich zu Preisen, Flughafentransfers, Flugnummern, Fahrzeugwünschen oder anderen ONRODA-Themen."); return; }
    if (/^(danke|vielen dank|dankeschon|dankeschoen)[ !.]*$/i.test(normalize(question))) { addMessage("Gern! Wenn du persönlich Hilfe brauchst, erreichst du uns über WhatsApp.", false, faq[faq.length - 1]); return; }
    var answers = topicId ? faq.filter(function (item) { return item.id === topicId; }) : findAnswers(question);
    if (!answers.length) { addMessage("Darauf habe ich keine verlässliche hinterlegte Antwort. Bitte frag unser Team über WhatsApp.", false, faq[faq.length - 1]); return; }
    answers.forEach(function (item) { addMessage(item.answer, false, item); });
  }
  ["price", "flight", "vehicle", "luggage", "reservation", "care"].forEach(function (id) {
    var item = faq.filter(function (entry) { return entry.id === id; })[0];
    var button = document.createElement("button"); button.type = "button"; button.textContent = item.question;
    button.addEventListener("click", function () { reply(item.question, item.id); }); topics.appendChild(button);
  });
  addMessage("Hallo! Ich helfe dir mit allgemeinen Fragen zu ONRODA. Wähle ein Thema oder schreib deine Frage. Für konkrete Buchungen und Sonderwünsche helfen dir die App und unser Team auf WhatsApp.");
  toggle.addEventListener("click", function () { setOpen(panel.hidden); });
  close.addEventListener("click", function () { setOpen(false); });
  form.addEventListener("submit", function (event) { event.preventDefault(); reply(input.value); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); setOpen(false); } });
  document.addEventListener("click", function (event) { if (!panel.hidden && !root.contains(event.target)) { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); } });
})();
