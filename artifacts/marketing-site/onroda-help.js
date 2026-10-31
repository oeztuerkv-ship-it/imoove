/* Self-hosted FAQ helper. No AI service, network calls, storage or booking actions. */
(function () {
  "use strict";
  var faq = [
    { id: "price", question: "Was kostet meine Fahrt?", terms: ["preis", "preise", "wie viel", "wieviel", "euro", "gunstig", "billig", "kosten", "kostet", "teuer", "pauschal", "festpreis", "tarif", "taxameter"], answer: "Gerne helfe ich dir zum Preis 😊 Im Preisrechner kannst du deine Strecke eingeben und einen verfügbaren Pauschalpreis prüfen. Für einen Transfer mit besonderen Wünschen wähle „Transfer planen“ – ich stelle die Angaben für unser Team zusammen.", href: "/fixpreise/#fixpreis-calculator", link: "Strecke und Preis prüfen" },
    { id: "flight", question: "Flugnummer oder Verspätung?", terms: ["flugnummer", "flug nummer", "verspatung", "verspaetung", "verspatet", "landet", "landung", "flug gestrichen", "flug andert", "ankunftszeit", "abflugzeit"], answer: "Ja, unser Team schaut nach deiner Flugnummer und prüft mögliche Verspätungen. Schick uns dafür bitte Flugnummer, Reisetag und deine geplante Abholzeit per WhatsApp. Dann stimmen wir die Abholung mit dir ab. Hier im Chat kann ich keine Live-Flugdaten abrufen.", href: "https://wa.me/4917684229016", link: "Flugdaten per WhatsApp besprechen" },
    { id: "vehicle", question: "VIP oder E-Klasse möglich?", terms: ["vip", "e klasse", "eclass", "mercedes", "luxus", "premium", "fahrzeugwunsch", "kombi", "limousine", "business fahrzeug", "business class", "vipfahrzeug", "luxusfahrzeug"], answer: "Ja, einen schwarzen Mercedes-Benz E-Klasse Kombi kannst du bei uns anfragen 😊 Wie viele Personen fahren mit, und wie viel Gepäck habt ihr? Unser Team bestätigt dir das Fahrzeug für deinen Termin.", href: "https://wa.me/4917684229016", link: "Fahrzeugwunsch anfragen" },
    { id: "airport", question: "Wie buche ich einen Flughafentransfer?", terms: ["flughafen", "airport", "transfer", "terminal", "treffpunkt", "abholen am flughafen"], answer: "Flughafentransfers kannst du über ONRODA anfragen. Prüfe deine Strecke im Preisrechner und buche anschließend in der App. Den genauen Treffpunkt und besondere Abholwünsche klärst du bei der Anfrage. Eine konkrete Fahrer-Verfügbarkeit muss für deine Fahrt bestätigt werden.", href: "/fixpreise/", link: "Zum Flughafentransfer" },
    { id: "booking", question: "Wie bestelle ich ein Taxi?", terms: ["taxi", "taxifahrt", "taxibestellung", "buchen", "bestellen", "fahrt anfragen", "brauche eine fahrt", "will fahren"], answer: "Du kannst direkt in der ONRODA App eine Fahrt anfragen. Geht es um einen Flughafentransfer oder einen besonderen Fahrzeugwunsch? Wähle „Transfer planen“ – dann gehen wir die nötigen Angaben gemeinsam durch.", href: "/#jetzt-buchen", link: "Zur ONRODA App" },
    { id: "luggage", question: "Wie viele Personen und Koffer passen?", terms: ["koffer", "gepack", "gepaeck", "handgepack", "reisegepack", "reisetasche", "taschen", "personen", "passagiere", "grossraum", "xl", "kinderwagen", "viel platz", "sitzplatze"], answer: "Drei oder vier Koffer? Nenne uns bitte auch die Anzahl der Personen und ob es große Koffer oder Handgepäck sind. Dann stimmen wir einen passenden Kombi oder ein größeres Fahrzeug mit dir ab. Kinderwagen oder zusätzliches Gepäck bitte dazuschreiben.", href: "https://wa.me/4917684229016", link: "Personen und Gepäck abstimmen" },
    { id: "child", question: "Kann ich einen Kindersitz anfragen?", terms: ["kindersitz", "babyschale", "sitzerhohung", "sitzerhoehung", "baby", "kleinkind"], answer: "Teile einen benötigten Kindersitz bitte vorab persönlich mit. Ob ein passender Sitz gestellt werden kann, muss das Team für deine Anfrage bestätigen. Dieser Chat kann keine Ausstattung reservieren.", href: "https://wa.me/4917684229016", link: "Kindersitz persönlich anfragen" },
    { id: "reservation", question: "Kann ich vorbestellen?", terms: ["vorbestellen", "vorbestellung", "reservieren", "reservierung", "morgen", "fruh", "frueh", "nachts", "uhrzeit", "termin"], answer: "Du kannst Fahrten in der ONRODA App für einen späteren Zeitpunkt planen. Gib Abholort, Ziel und gewünschten Zeitpunkt an. Maßgeblich ist die Bestätigung deiner Anfrage; dieser Chat kann keine Fahrt oder Abholzeit verbindlich bestätigen.", href: "/#jetzt-buchen", link: "Fahrt in der App planen" },
    { id: "region", question: "Wo vermittelt ONRODA?", terms: ["gebiet", "region", "verfugbar", "verfuegbar", "baden wurttemberg", "baden wuerttemberg", "esslingen", "stuttgart", "leinfelden", "echterdingen", "filderstadt", "deutschland"], answer: "ONRODA vermittelt Fahrten in Stuttgart, Esslingen, Leinfelden-Echterdingen und ganz Baden-Württemberg. Ob für deinen Abholort und Zeitpunkt ein Fahrzeug verfügbar ist, ergibt sich aus deiner konkreten Anfrage. Weitere Strecken kannst du persönlich mit uns besprechen.", href: "https://wa.me/4917684229016", link: "Abholort persönlich klären" },
    { id: "care", question: "Wie funktionieren Krankenfahrten?", terms: ["krankenfahrt", "dialyse", "arzt", "reha", "transportschein", "verordnung", "krankenkasse", "rollstuhl"], answer: "ONRODA unterstützt die Organisation von Krankenfahrten und die Erfassung der benötigten Unterlagen. Gib Rollstuhl- oder Sonderbedarf bei der Anfrage an. Eine Kostenübernahme oder Genehmigung durch die Krankenkasse kann dieser Chat nicht prüfen oder bestätigen.", href: "/#care", link: "Informationen zu Krankenfahrten" },
    { id: "business", question: "Gibt es Geschäfts- und Firmenfahrten?", terms: ["geschaftsreise", "geschaeftsreise", "firma", "firmen", "unternehmen", "hotel", "kostenstelle", "gutschein", "partner", "rechnung", "firmenrechnung", "sammelrechnung"], answer: "ONRODA bietet Angebote für Unternehmen, Hotels und Reisepartner mit Codes, Kostenstellen und digitaler Abrechnung. Ein Partner-Zugang erfolgt nach Prüfung und Freigabe. Welche Abrechnung für dich möglich ist, klärt das Team mit dir.", href: "/#unternehmen", link: "Angebote für Unternehmen" },
    { id: "payment", question: "Wie kann ich bezahlen?", terms: ["bezahlen", "zahlung", "bar", "kreditkarte", "kreditkartezahlen", "karte", "kartenzahlung", "cash", "visa", "mastercard", "apple pay", "google pay", "beleg", "quittung"], answer: "Klar, bar oder mit Kreditkarte geht beides 😊 Für eine Firmenfahrt mit Rechnung hilft dir unser Team gerne weiter.", href: "/#jetzt-buchen", link: "Buchung und Zahlung in der App" },
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
  root.innerHTML = '<button type="button" class="onroda-help__toggle" id="onroda-help-toggle" aria-label="Kardelen – ONRODA Fragen und Antworten öffnen" aria-controls="onroda-help-panel" aria-expanded="false" title="Fragen &amp; Antworten"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-4 3V11.5a10 10 0 0 1 20 0Z" transform="translate(1 -2) scale(.92)"/><path d="M9.5 8a2.5 2.5 0 0 1 5 .3c0 1.8-2.5 2-2.5 3.7M12 15.5h.01"/></svg></button><section class="onroda-help__panel" id="onroda-help-panel" role="dialog" aria-modal="false" aria-labelledby="onroda-help-title" hidden><header class="onroda-help__header"><div><h2 id="onroda-help-title">Kardelen</h2><p>Deine digitale ONRODA-Assistentin</p></div><button type="button" class="onroda-help__close" aria-label="Hilfe schließen">×</button></header><div class="onroda-help__messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Fragen und Antworten"></div><div class="onroda-help__topics" aria-label="Häufige Themen"></div><form class="onroda-help__form"><label for="onroda-help-input">Deine Frage</label><div><input id="onroda-help-input" name="question" type="text" maxlength="400" aria-label="Deine Frage" autocomplete="off" placeholder="Zum Beispiel: Wir haben 4 Koffer" required /><button type="submit">Senden</button></div></form><p class="onroda-help__note">Persönlich weiter? Schreib uns auf WhatsApp.</p></section>';
  document.body.appendChild(root);
  var toggle = root.querySelector(".onroda-help__toggle");
  var panel = root.querySelector(".onroda-help__panel");
  var close = root.querySelector(".onroda-help__close");
  var messages = root.querySelector(".onroda-help__messages");
  var topics = root.querySelector(".onroda-help__topics");
  var lastTopic = "";
  var luggageDetails = {};
  var plan = null;
  var planSteps = [
    { key:"route", question:"Gerne, planen wir deinen Transfer 😊 Von wo nach wo möchtest du fahren? Zum Beispiel: Esslingen → Flughafen Stuttgart." },
    { key:"date", question:"An welchem Tag und um wie viel Uhr möchtest du abgeholt werden? Bei einer Flughafen-Abholung nenne bitte die geplante Landezeit." },
    { key:"flight", question:"Wie lautet deine Flugnummer? Unser Team kann damit nach Verspätungen schauen. Falls sie noch fehlt oder du keine hast, schreib einfach ‚ohne‘." },
    { key:"luggage", question:"Wie viele Personen fahren mit, und wie viele große Koffer oder Handgepäckstücke habt ihr? Sag auch dazu, wenn ein Kindersitz, Rollstuhl oder besonders viel Platz gebraucht wird." }
  ];
  function stopPlan() { plan = null; planCancel.hidden = true; }
  function planReply(question) {
    var normalized = normalize(question);
    if (/^(abbrechen|stop|stopp|beenden|planung beenden)$/.test(normalized)) { stopPlan(); addMessage("Alles klar, die Planung ist beendet. Was möchtest du stattdessen wissen?"); return; }
    var specific = findAnswers(question);
    var isQuestion = /\?/.test(question) || /^(kann|konnen|darf|geht|was kostet|wie kann|wie bezahl|akzeptiert|habt ihr)\b/.test(normalized);
    if (isQuestion) {
      if (specific.length) specific.forEach(function (item) { addMessage(item.answer, false, item); });
      else addMessage("Das klärt unser Team gerne mit dir. Für deine Transferanfrage brauche ich noch diese Angabe:");
      addMessage(planSteps[plan.step].question); return;
    }
    if (question.length < 3) { addMessage("Magst du die Angabe etwas genauer schreiben? " + planSteps[plan.step].question); return; }
    plan.values[planSteps[plan.step].key] = question;
    plan.step += 1;
    if (plan.step < planSteps.length) { addMessage(planSteps[plan.step].question); return; }
    var values = plan.values;
    var summary = "Transferanfrage ONRODA\nStrecke: " + values.route + "\nTermin / Uhrzeit: " + values.date + "\nFlugnummer: " + values.flight + "\nPersonen / Gepäck / Wünsche: " + values.luggage;
    addMessage("Das habe ich für dich zusammengestellt:\n\n" + summary + "\n\nSchick die Angaben jetzt unserem Team. Wir klären Fahrzeug, Platz und Preis mit dir. Das ist noch keine bestätigte Buchung.", false, {id:"plan",href:"https://wa.me/4917684229016?text=" + encodeURIComponent(summary),link:"Anfrage auf WhatsApp öffnen"});
    stopPlan();
  }
  var form = root.querySelector(".onroda-help__form");
  var input = root.querySelector("input");
  function addMessage(text, user, item) {
    var row = document.createElement("div");
    row.className = "onroda-help__message" + (user ? " onroda-help__message--user" : "");
    var label = document.createElement("span"); label.className = "onroda-help__sender"; label.textContent = user ? "Du" : "Kardelen"; row.appendChild(label);
    if (item && item.id === "vehicle") { var photo = document.createElement("img"); photo.src = "/images/e-klasse-kombi-flughafen.jpg"; photo.alt = "Illustration: schwarze Mercedes E-Klasse als Kombi"; photo.className = "onroda-help__vehicle"; photo.width = 1536; photo.height = 1024; photo.loading = "lazy"; row.appendChild(photo); }
    var p = document.createElement("p"); p.textContent = text; row.appendChild(p);
    if (item) {
      var link = document.createElement("a"); link.href = item.href; link.textContent = item.link + " ↗";
      if (item.href.indexOf("https://wa.me/") === 0) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      row.appendChild(link);
      if (item.href.indexOf("https://wa.me/") !== 0) { var contact = document.createElement("a"); contact.href = "https://wa.me/4917684229016"; contact.target = "_blank"; contact.rel = "noopener noreferrer"; contact.className = "onroda-help__contact"; contact.textContent = "Persönlich auf WhatsApp →"; row.appendChild(contact); }
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
    if (topicId === "plan" || (!plan && /\b(?:ich|wir) (?:will|wollen|mochte|mochten|brauche|brauchen)\b.*\b(?:taxi|transfer|flughafen)\b/.test(normalize(question)) && !findAnswers(question).some(function (item) { return item.id === "price"; }))) { plan = {step:0,values:{}}; planCancel.hidden = false; addMessage(planSteps[0].question); return; }
    if (plan) { planReply(question); return; }
    if (/^(hallo|hi|hey|guten tag|guten morgen|guten abend)[ !.]*$/i.test(question)) { addMessage("Hallo! Frag mich zu Preisen, Flughafentransfers, Flugnummern, Fahrzeugwünschen oder anderen ONRODA-Themen."); return; }
    if (/^(danke|vielen dank|dankeschon|dankeschoen)[ !.]*$/i.test(normalize(question))) { addMessage("Gern! Wenn du persönlich Hilfe brauchst, erreichst du uns über WhatsApp.", false, faq[faq.length - 1]); return; }
    var answers = topicId ? faq.filter(function (item) { return item.id === topicId; }) : findAnswers(question);
    if (!answers.length && lastTopic === "luggage" && /\b(\d{1,2}|zwei|drei|vier|funf|sechs|grosse|gross|kleine|klein|handgepack)\b/.test(normalize(question))) answers = faq.filter(function (item) { return item.id === "luggage"; });
    lastTopic = answers.length ? answers[0].id : "";
    if (!answers.length) { addMessage("Da bin ich mir nicht sicher. Schreib unserem Team kurz auf WhatsApp – dort klären wir das gerne persönlich mit dir.", false, faq[faq.length - 1]); return; }
    answers.forEach(function (item) {
      var answer = item.answer;
      if (item.id === "luggage") {
        var normalized = normalize(question).replace(/\bzwei\b/g,"2").replace(/\bdrei\b/g,"3").replace(/\bvier\b/g,"4").replace(/\bfunf\b/g,"5").replace(/\bsechs\b/g,"6");
        var bags = normalized.match(/\b(\d{1,2})\s*(?:(?:grosse|grosser|grossen|kleine|kleiner|kleinen)\s+)?(?:koffer|gepack|taschen|handgepack)\b/);
        var people = normalized.match(/\b(\d{1,2})\s*(?:personen|person|erwachsene|leute|fahrgaste)\b/) || normalized.match(/\b(?:wir sind|zu)\s*(\d{1,2})\b/);
        if (bags) luggageDetails.bags = bags[1];
        if (people) luggageDetails.people = people[1];
        if (/\b(?:gross|grosse|grossen|grosser)\b/.test(normalized)) luggageDetails.size = "große Koffer";
        else if (/\bhandgepack\b/.test(normalized)) luggageDetails.size = "Handgepäckstücke";
        if (!luggageDetails.bags) answer = "Wie viele Koffer habt ihr dabei? Sag mir bitte auch, wie viele Personen mitfahren und ob es große Koffer oder Handgepäck sind 😊";
        else if (!luggageDetails.people) answer = "Okay, " + luggageDetails.bags + " Gepäckstücke 😊 Wie viele Personen fahren mit?" + (luggageDetails.size ? "" : " Und sind das große Koffer oder Handgepäck?");
        else if (!luggageDetails.size) answer = "Alles klar: " + luggageDetails.people + " Personen und " + luggageDetails.bags + " Gepäckstücke. Sind das große Koffer oder Handgepäck?";
        else answer = "Danke! " + luggageDetails.people + " Personen und " + luggageDetails.bags + " " + luggageDetails.size + ". Damit kann unser Team prüfen, ob ein Mercedes-Kombi passt oder ihr mehr Platz braucht. Über WhatsApp könnt ihr das passende Fahrzeug direkt abstimmen.";
      }
      addMessage(answer, false, item);
    });
  }
  var planButton = document.createElement("button"); planButton.type = "button"; planButton.className = "onroda-help__plan"; planButton.textContent = "Transfer planen →";
  planButton.addEventListener("click", function () { reply("Ich möchte meinen Transfer planen", "plan"); }); topics.appendChild(planButton);
  var planCancel = document.createElement("button"); planCancel.type = "button"; planCancel.textContent = "Planung beenden"; planCancel.hidden = true;
  planCancel.addEventListener("click", function () { stopPlan(); addMessage("Alles klar, die Planung ist beendet. Deine Angaben wurden nicht an uns gesendet."); }); topics.appendChild(planCancel);
  ["price", "vehicle", "luggage", "flight", "payment", "reservation"].forEach(function (id) {
    var item = faq.filter(function (entry) { return entry.id === id; })[0];
    var button = document.createElement("button"); button.type = "button"; button.textContent = ({price:"Preis prüfen",vehicle:"Mercedes-Kombi",luggage:"3–4 Koffer",flight:"Flug & Verspätung",payment:"Bar oder Karte?",reservation:"Vorbestellen"})[id];
    button.addEventListener("click", function () { reply(item.question, item.id); }); topics.appendChild(button);
  });
  addMessage("Hallo, ich bin Kardelen, deine digitale ONRODA-Assistentin 😊 Wie kann ich dir helfen? Zum Beispiel beim Flughafentransfer, beim passenden Fahrzeug oder mit einer Frage zur Zahlung.");
  toggle.addEventListener("click", function () { setOpen(panel.hidden); });
  close.addEventListener("click", function () { setOpen(false); });
  form.addEventListener("submit", function (event) { event.preventDefault(); reply(input.value); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); setOpen(false); } });
  document.addEventListener("click", function (event) { if (!panel.hidden && !root.contains(event.target)) { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); } });
})();
