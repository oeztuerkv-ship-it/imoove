/* Reviewed ONRODA FAQ examples: edit facts here, not in the conversation engine. */
(function(root){"use strict";var data={
  "version": "2026-11-01",
  "records": [
    {
      "id": 1,
      "intent": "greeting",
      "answer": "greeting",
      "questions": {
        "de": "Hallo, Hi, Guten Morgen",
        "en": "Hello, good morning",
        "tr": "Merhaba, günaydın"
      }
    },
    {
      "id": 2,
      "intent": "information",
      "answer": "about",
      "questions": {
        "de": "Was ist ONRODA?",
        "en": "What is ONRODA?",
        "tr": "ONRODA nedir?"
      }
    },
    {
      "id": 3,
      "intent": "information",
      "answer": "capabilities",
      "questions": {
        "de": "Was kannst du?",
        "en": "What can you do?",
        "tr": "Ne yapabilirsin?"
      }
    },
    {
      "id": 4,
      "intent": "information",
      "answer": "identity",
      "questions": {
        "de": "Bist du eine KI?",
        "en": "Are you an AI?",
        "tr": "Yapay zeka mısın?"
      }
    },
    {
      "id": 5,
      "intent": "information",
      "answer": "region",
      "questions": {
        "de": "Wo seid ihr?",
        "en": "Where are you based?",
        "tr": "Neredesiniz?"
      }
    },
    {
      "id": 6,
      "intent": "information",
      "answer": "region",
      "questions": {
        "de": "Fahrt ihr überall hin?",
        "en": "Do you travel everywhere?",
        "tr": "Her yere gidiyor musunuz?"
      }
    },
    {
      "id": 7,
      "intent": "information",
      "answer": "licensed",
      "questions": {
        "de": "Seid ihr seriös?",
        "en": "Are you legitimate?",
        "tr": "Güvenilir misiniz?"
      }
    },
    {
      "id": 8,
      "intent": "human",
      "answer": "contact",
      "questions": {
        "de": "Seid ihr heute erreichbar?",
        "en": "Can I reach you today?",
        "tr": "Bugün size ulaşabilir miyim?"
      }
    },
    {
      "id": 9,
      "intent": "price",
      "answer": "price",
      "questions": {
        "de": "Was kostet Stuttgart nach Esslingen?",
        "en": "How much from Stuttgart to Esslingen?",
        "tr": "Stuttgart Esslingen arası kaç para?"
      }
    },
    {
      "id": 10,
      "intent": "fixed_price",
      "answer": "fixed",
      "questions": {
        "de": "Macht ihr Festpreise?",
        "en": "Do you offer fixed prices?",
        "tr": "Sabit fiyat var mı?"
      }
    },
    {
      "id": 11,
      "intent": "fixed_price",
      "answer": "fixed",
      "questions": {
        "de": "Ich brauche einen Pauschalpreis",
        "en": "I need a flat fare",
        "tr": "Sabit ücret istiyorum"
      }
    },
    {
      "id": 12,
      "intent": "fixed_price",
      "answer": "fixed",
      "questions": {
        "de": "Taxi zum Fixpreis?",
        "en": "Fixed price taxi?",
        "tr": "Sabit fiyatlı taksi?"
      }
    },
    {
      "id": 13,
      "intent": "offer",
      "answer": "offer",
      "questions": {
        "de": "Kannst du ein Angebot machen?",
        "en": "Can you give me a quote?",
        "tr": "Fiyat teklifi verebilir misiniz?"
      }
    },
    {
      "id": 14,
      "intent": "price",
      "answer": "price",
      "questions": {
        "de": "Was kostet das ungefähr?",
        "en": "What is the estimated fare?",
        "tr": "Yaklaşık ne kadar tutar?"
      }
    },
    {
      "id": 15,
      "intent": "price",
      "answer": "binding",
      "questions": {
        "de": "Ist der Preis verbindlich?",
        "en": "Is the price binding?",
        "tr": "Fiyat kesin mi?"
      }
    },
    {
      "id": 16,
      "intent": "price",
      "answer": "per_person",
      "questions": {
        "de": "Ist das pro Person?",
        "en": "Is that per person?",
        "tr": "Bu kişi başı mı?"
      }
    },
    {
      "id": 17,
      "intent": "negotiation",
      "answer": "negotiation",
      "questions": {
        "de": "Kann ich handeln?",
        "en": "Can I negotiate?",
        "tr": "Pazarlık yapabilir miyim?"
      }
    },
    {
      "id": 18,
      "intent": "price",
      "answer": "comparison",
      "questions": {
        "de": "Uber ist billiger",
        "en": "Uber is cheaper",
        "tr": "Uber daha ucuz"
      }
    },
    {
      "id": 19,
      "intent": "negotiation",
      "answer": "negotiation",
      "questions": {
        "de": "Gibt es Rabatt?",
        "en": "Is there a discount?",
        "tr": "İndirim var mı?"
      }
    },
    {
      "id": 20,
      "intent": "price",
      "answer": "extras",
      "questions": {
        "de": "Gibt es Nachtzuschlag?",
        "en": "Is there a night surcharge?",
        "tr": "Gece farkı var mı?"
      }
    },
    {
      "id": 21,
      "intent": "luggage",
      "answer": "luggage_fee",
      "questions": {
        "de": "Ist Gepäck inklusive?",
        "en": "Is luggage included?",
        "tr": "Bagaj dahil mi?"
      }
    },
    {
      "id": 22,
      "intent": "price",
      "answer": "waiting",
      "questions": {
        "de": "Kostet Warten extra?",
        "en": "Does waiting cost extra?",
        "tr": "Beklemek ekstra ücretli mi?"
      }
    },
    {
      "id": 23,
      "intent": "return_trip",
      "answer": "return",
      "questions": {
        "de": "Was kostet Hin- und Rückfahrt?",
        "en": "How much for a return trip?",
        "tr": "Gidiş dönüş ne kadar?"
      }
    },
    {
      "id": 24,
      "intent": "fixed_price",
      "answer": "fixed",
      "questions": {
        "de": "Kann ich einen Festpreis ohne Taxameter bekommen?",
        "en": "Can I get a fixed fare without the meter?",
        "tr": "Taksimetresiz sabit fiyat olur mu?"
      }
    },
    {
      "id": 25,
      "intent": "price",
      "answer": "comparison",
      "questions": {
        "de": "Warum ist das so teuer?",
        "en": "Why is it so expensive?",
        "tr": "Neden bu kadar pahalı?"
      }
    },
    {
      "id": 26,
      "intent": "vehicle",
      "answer": "vehicle",
      "questions": {
        "de": "Welche Autos habt ihr?",
        "en": "What cars do you have?",
        "tr": "Hangi araçlarınız var?"
      }
    },
    {
      "id": 27,
      "intent": "vehicle",
      "answer": "vehicle",
      "questions": {
        "de": "Habt ihr Mercedes?",
        "en": "Do you have Mercedes cars?",
        "tr": "Mercedes var mı?"
      }
    },
    {
      "id": 28,
      "intent": "vehicle",
      "answer": "vehicle",
      "questions": {
        "de": "Ich möchte unbedingt eine E-Klasse",
        "en": "I specifically want an E Class",
        "tr": "Özellikle E Serisi istiyorum"
      }
    },
    {
      "id": 29,
      "intent": "vehicle",
      "answer": "special_vehicle",
      "questions": {
        "de": "Habt ihr S-Klasse?",
        "en": "Do you have an S Class?",
        "tr": "S Serisi var mı?"
      }
    },
    {
      "id": 30,
      "intent": "vehicle",
      "answer": "vehicle",
      "questions": {
        "de": "Habt ihr Kombis?",
        "en": "Do you have estate cars?",
        "tr": "Station wagon var mı?"
      }
    },
    {
      "id": 31,
      "intent": "vehicle",
      "answer": "clean",
      "questions": {
        "de": "Ist das Fahrzeug sauber?",
        "en": "Is the car clean?",
        "tr": "Araç temiz mi?"
      }
    },
    {
      "id": 32,
      "intent": "vehicle",
      "answer": "equipment",
      "questions": {
        "de": "Hat das Auto Klimaanlage?",
        "en": "Does the car have air conditioning?",
        "tr": "Araçta klima var mı?"
      }
    },
    {
      "id": 33,
      "intent": "vehicle",
      "answer": "colour",
      "questions": {
        "de": "Ist das Fahrzeug schwarz?",
        "en": "Is the car black?",
        "tr": "Araç siyah mı?"
      }
    },
    {
      "id": 34,
      "intent": "information",
      "answer": "licensed",
      "questions": {
        "de": "Ist das ein richtiges Taxi?",
        "en": "Is this a licensed taxi?",
        "tr": "Bu ruhsatlı bir taksi mi?"
      }
    },
    {
      "id": 35,
      "intent": "vehicle",
      "answer": "special_vehicle",
      "questions": {
        "de": "Habt ihr Elektroautos?",
        "en": "Do you have electric cars?",
        "tr": "Elektrikli araç var mı?"
      }
    },
    {
      "id": 36,
      "intent": "luggage",
      "answer": "luggage",
      "questions": {
        "de": "Ich habe einen großen Koffer",
        "en": "I have one large suitcase",
        "tr": "Bir büyük valizim var"
      }
    },
    {
      "id": 37,
      "intent": "luggage",
      "answer": "luggage",
      "questions": {
        "de": "Wir haben vier große Koffer",
        "en": "We have four large suitcases",
        "tr": "Dört büyük valizimiz var"
      }
    },
    {
      "id": 38,
      "intent": "large_luggage",
      "answer": "large_luggage",
      "questions": {
        "de": "Ich habe zehn Koffer",
        "en": "I have ten suitcases",
        "tr": "On valizim var"
      }
    },
    {
      "id": 39,
      "intent": "stroller",
      "answer": "stroller",
      "questions": {
        "de": "Ich habe einen Kinderwagen",
        "en": "I have a stroller",
        "tr": "Bebek arabam var"
      }
    },
    {
      "id": 40,
      "intent": "bicycle",
      "answer": "bicycle",
      "questions": {
        "de": "Kann ich mein Fahrrad mitnehmen?",
        "en": "Can I bring a bicycle?",
        "tr": "Bisikletimi götürebilir miyim?"
      }
    },
    {
      "id": 41,
      "intent": "accessibility",
      "answer": "accessibility",
      "questions": {
        "de": "Ich habe einen Rollstuhl",
        "en": "I have a wheelchair",
        "tr": "Tekerlekli sandalyem var"
      }
    },
    {
      "id": 42,
      "intent": "bulky",
      "answer": "bulky",
      "questions": {
        "de": "Ich habe einen Fernseher dabei",
        "en": "I have a television with me",
        "tr": "Yanımda televizyon var"
      }
    },
    {
      "id": 43,
      "intent": "pet",
      "answer": "dog",
      "questions": {
        "de": "Ich habe einen Hund",
        "en": "I have a dog",
        "tr": "Köpeğim var"
      }
    },
    {
      "id": 44,
      "intent": "pet",
      "answer": "cat",
      "questions": {
        "de": "Kann eine Katze mit?",
        "en": "Can a cat come along?",
        "tr": "Kedi gelebilir mi?"
      }
    },
    {
      "id": 45,
      "intent": "luggage",
      "answer": "backpack",
      "questions": {
        "de": "Ich habe nur einen Rucksack",
        "en": "I only have a backpack",
        "tr": "Sadece sırt çantam var"
      }
    },
    {
      "id": 46,
      "intent": "luggage",
      "answer": "luggage",
      "questions": {
        "de": "Passt alles ins Auto?",
        "en": "Will everything fit in the car?",
        "tr": "Hepsi araca sığar mı?"
      }
    },
    {
      "id": 47,
      "intent": "airport",
      "answer": "airport",
      "questions": {
        "de": "Ich brauche einen Flughafentransfer",
        "en": "I need an airport transfer",
        "tr": "Havalimanı transferi istiyorum"
      }
    },
    {
      "id": 48,
      "intent": "airport",
      "answer": "departure",
      "questions": {
        "de": "Mein Flug geht um sieben",
        "en": "My flight leaves at seven",
        "tr": "Uçağım saat yedide kalkıyor"
      }
    },
    {
      "id": 49,
      "intent": "airport",
      "answer": "arrival",
      "questions": {
        "de": "Ich lande um 22 Uhr",
        "en": "I land at 10 pm",
        "tr": "Saat 22'de iniyorum"
      }
    },
    {
      "id": 50,
      "intent": "flight",
      "answer": "flight",
      "questions": {
        "de": "Mein Flug hat Verspätung",
        "en": "My flight is delayed",
        "tr": "Uçağım gecikti"
      }
    },
    {
      "id": 51,
      "intent": "flight",
      "answer": "flight",
      "questions": {
        "de": "Verfolgt ihr meinen Flug?",
        "en": "Do you track my flight?",
        "tr": "Uçuşumu takip ediyor musunuz?"
      }
    },
    {
      "id": 52,
      "intent": "meeting",
      "answer": "meeting",
      "questions": {
        "de": "Wo wartet der Fahrer?",
        "en": "Where will the driver wait?",
        "tr": "Şoför nerede bekliyor?"
      }
    },
    {
      "id": 53,
      "intent": "meeting",
      "answer": "meeting",
      "questions": {
        "de": "Wartet der Fahrer am Terminal?",
        "en": "Will the driver wait at the terminal?",
        "tr": "Şoför terminalde bekliyor mu?"
      }
    },
    {
      "id": 54,
      "intent": "cancelled_flight",
      "answer": "cancelled_flight",
      "questions": {
        "de": "Mein Flug wurde gestrichen",
        "en": "My flight was cancelled",
        "tr": "Uçuşum iptal edildi"
      }
    },
    {
      "id": 55,
      "intent": "flight",
      "answer": "no_flight",
      "questions": {
        "de": "Ich habe keine Flugnummer",
        "en": "I have no flight number",
        "tr": "Uçuş numaram yok"
      }
    },
    {
      "id": 56,
      "intent": "meeting",
      "answer": "offline_airport",
      "questions": {
        "de": "Ich will am Flughafen abgeholt werden habe aber kein Internet",
        "en": "Airport pickup without internet",
        "tr": "İnternet olmadan havalimanından alınmak istiyorum"
      }
    },
    {
      "id": 57,
      "intent": "instant",
      "answer": "booking",
      "questions": {
        "de": "Ich brauche jetzt ein Taxi",
        "en": "I need a taxi now",
        "tr": "Şimdi taksi lazım"
      }
    },
    {
      "id": 58,
      "intent": "reservation",
      "answer": "reservation",
      "questions": {
        "de": "Ich brauche morgen ein Taxi",
        "en": "I need a taxi tomorrow",
        "tr": "Yarın taksi lazım"
      }
    },
    {
      "id": 59,
      "intent": "reservation",
      "answer": "reservation",
      "questions": {
        "de": "Kann ich nächste Woche buchen?",
        "en": "Can I reserve for next week?",
        "tr": "Gelecek haftaya rezervasyon yapabilir miyim?"
      }
    },
    {
      "id": 60,
      "intent": "booking",
      "answer": "booking",
      "questions": {
        "de": "Kannst du ein Taxi bestellen?",
        "en": "Can you order a taxi?",
        "tr": "Taksi çağırabilir misin?"
      }
    },
    {
      "id": 61,
      "intent": "status",
      "answer": "status",
      "questions": {
        "de": "Ist meine Fahrt bestätigt?",
        "en": "Is my ride confirmed?",
        "tr": "Yolculuğum onaylandı mı?"
      }
    },
    {
      "id": 62,
      "intent": "status",
      "answer": "status",
      "questions": {
        "de": "Wann kommt mein Fahrer?",
        "en": "When will my driver arrive?",
        "tr": "Şoförüm ne zaman gelir?"
      }
    },
    {
      "id": 63,
      "intent": "change_booking",
      "answer": "change",
      "questions": {
        "de": "Ich möchte meine Buchung ändern",
        "en": "I want to change my booking",
        "tr": "Rezervasyonumu değiştirmek istiyorum"
      }
    },
    {
      "id": 64,
      "intent": "cancel",
      "answer": "cancel",
      "questions": {
        "de": "Ich möchte stornieren",
        "en": "I want to cancel my booking",
        "tr": "Rezervasyonumu iptal etmek istiyorum"
      }
    },
    {
      "id": 65,
      "intent": "status",
      "answer": "two_rides",
      "questions": {
        "de": "Ich habe zwei Fahrten gebucht",
        "en": "I booked two rides",
        "tr": "İki yolculuk ayırttım"
      }
    },
    {
      "id": 66,
      "intent": "stops",
      "answer": "stops",
      "questions": {
        "de": "Kann ich mehrere Stopps machen?",
        "en": "Can I make multiple stops?",
        "tr": "Birden fazla durak olabilir mi?"
      }
    },
    {
      "id": 67,
      "intent": "booking",
      "answer": "other_person",
      "questions": {
        "de": "Kann ich eine andere Person abholen lassen?",
        "en": "Can I book for another person?",
        "tr": "Başka biri için araç isteyebilir miyim?"
      }
    },
    {
      "id": 68,
      "intent": "reservation",
      "answer": "uncertain_time",
      "questions": {
        "de": "Ich weiß noch nicht genau wann",
        "en": "I do not know the exact time yet",
        "tr": "Saat henüz belli değil"
      }
    },
    {
      "id": 69,
      "intent": "group",
      "answer": "group",
      "questions": {
        "de": "Wir sind fünf Personen",
        "en": "We are five passengers",
        "tr": "Beş kişiyiz"
      }
    },
    {
      "id": 70,
      "intent": "group",
      "answer": "group",
      "questions": {
        "de": "Wir sind acht Personen",
        "en": "We are eight passengers",
        "tr": "Sekiz kişiyiz"
      }
    },
    {
      "id": 71,
      "intent": "large_group",
      "answer": "large_group",
      "questions": {
        "de": "Wir sind zwanzig Leute",
        "en": "We are twenty people",
        "tr": "Yirmi kişiyiz"
      }
    },
    {
      "id": 72,
      "intent": "large_group",
      "answer": "large_group",
      "questions": {
        "de": "Wir brauchen drei Autos",
        "en": "We need three cars",
        "tr": "Üç araç lazım"
      }
    },
    {
      "id": 73,
      "intent": "group",
      "answer": "group",
      "questions": {
        "de": "Können alle zusammenfahren?",
        "en": "Can everyone travel together?",
        "tr": "Hepimiz birlikte gidebilir miyiz?"
      }
    },
    {
      "id": 74,
      "intent": "large_group",
      "answer": "large_group",
      "questions": {
        "de": "Wir kommen mit 36 Personen am Flughafen an",
        "en": "36 passengers arriving at the airport",
        "tr": "Havalimanına 36 kişi geliyoruz"
      }
    },
    {
      "id": 75,
      "intent": "child",
      "answer": "child",
      "questions": {
        "de": "Wir fahren mit Baby",
        "en": "We are travelling with a baby",
        "tr": "Bebekle seyahat ediyoruz"
      }
    },
    {
      "id": 76,
      "intent": "child",
      "answer": "child",
      "questions": {
        "de": "Habt ihr Kindersitze?",
        "en": "Do you have child seats?",
        "tr": "Çocuk koltuğu var mı?"
      }
    },
    {
      "id": 77,
      "intent": "senior",
      "answer": "senior",
      "questions": {
        "de": "Meine Mutter ist 85 Jahre alt",
        "en": "My mother is 85 years old",
        "tr": "Annem 85 yaşında"
      }
    },
    {
      "id": 78,
      "intent": "accessibility",
      "answer": "accessibility",
      "questions": {
        "de": "Ich brauche ein barrierefreies Taxi",
        "en": "I need an accessible taxi",
        "tr": "Engelli erişimine uygun taksi lazım"
      }
    },
    {
      "id": 79,
      "intent": "medical",
      "answer": "medical",
      "questions": {
        "de": "Fahrt ihr Kranke ins Krankenhaus?",
        "en": "Do you offer non-emergency hospital transport?",
        "tr": "Hastaneye hasta taşıması var mı?"
      }
    },
    {
      "id": 80,
      "intent": "medical",
      "answer": "medical_document",
      "questions": {
        "de": "Ich habe einen Transportschein",
        "en": "I have a transport prescription",
        "tr": "Hasta nakil belgem var"
      }
    },
    {
      "id": 81,
      "intent": "emergency",
      "answer": "medical_emergency",
      "questions": {
        "de": "Es ist ein medizinischer Notfall",
        "en": "It is a medical emergency",
        "tr": "Tıbbi acil durum var"
      }
    },
    {
      "id": 82,
      "intent": "payment",
      "answer": "payment",
      "questions": {
        "de": "Kann ich bar bezahlen?",
        "en": "Can I pay cash?",
        "tr": "Nakit ödeyebilir miyim?"
      }
    },
    {
      "id": 83,
      "intent": "payment",
      "answer": "payment",
      "questions": {
        "de": "Kann ich mit Karte zahlen?",
        "en": "Can I pay by credit card?",
        "tr": "Kredi kartıyla ödeyebilir miyim?"
      }
    },
    {
      "id": 84,
      "intent": "wallet",
      "answer": "wallet",
      "questions": {
        "de": "Akzeptiert ihr Apple Pay?",
        "en": "Do you accept Apple Pay?",
        "tr": "Apple Pay kabul ediyor musunuz?"
      }
    },
    {
      "id": 85,
      "intent": "invoice",
      "answer": "invoice",
      "questions": {
        "de": "Kann ich auf Rechnung fahren?",
        "en": "Can I pay by invoice?",
        "tr": "Fatura ile ödeme olur mu?"
      }
    },
    {
      "id": 86,
      "intent": "receipt",
      "answer": "receipt",
      "questions": {
        "de": "Bekomme ich eine Quittung?",
        "en": "Can I get a receipt?",
        "tr": "Fiş alabilir miyim?"
      }
    },
    {
      "id": 87,
      "intent": "tip",
      "answer": "tip",
      "questions": {
        "de": "Kann ich Trinkgeld geben?",
        "en": "Can I tip the driver?",
        "tr": "Bahşiş verebilir miyim?"
      }
    },
    {
      "id": 88,
      "intent": "prepayment",
      "answer": "prepayment",
      "questions": {
        "de": "Wird vorher abgebucht?",
        "en": "Will I be charged in advance?",
        "tr": "Önceden ödeme alınır mı?"
      }
    },
    {
      "id": 89,
      "intent": "payment",
      "answer": "after_payment",
      "questions": {
        "de": "Kann ich nach der Fahrt zahlen?",
        "en": "Can I pay after the ride?",
        "tr": "Yolculuktan sonra ödeyebilir miyim?"
      }
    },
    {
      "id": 90,
      "intent": "business",
      "answer": "regular",
      "questions": {
        "de": "Wir brauchen täglich ein Taxi",
        "en": "We need a taxi every day",
        "tr": "Her gün taksi lazım"
      }
    },
    {
      "id": 91,
      "intent": "hotel",
      "answer": "hotel",
      "questions": {
        "de": "Ich habe ein Hotel",
        "en": "I run a hotel",
        "tr": "Otel işletiyorum"
      }
    },
    {
      "id": 92,
      "intent": "business",
      "answer": "business",
      "questions": {
        "de": "Wir sind eine Firma",
        "en": "We are a company",
        "tr": "Biz bir şirketiz"
      }
    },
    {
      "id": 93,
      "intent": "contract",
      "answer": "contract",
      "questions": {
        "de": "Brauchen wir einen Vertrag?",
        "en": "Do we need a contract?",
        "tr": "Sözleşme gerekiyor mu?"
      }
    },
    {
      "id": 94,
      "intent": "hotel",
      "answer": "hotel_guests",
      "questions": {
        "de": "Können unsere Gäste selbst buchen?",
        "en": "Can our guests book themselves?",
        "tr": "Misafirlerimiz kendileri rezervasyon yapabilir mi?"
      }
    },
    {
      "id": 95,
      "intent": "vehicle",
      "answer": "chauffeur",
      "questions": {
        "de": "Wir brauchen einen Chauffeurservice",
        "en": "We need a chauffeur service",
        "tr": "Şoförlü transfer istiyoruz"
      }
    },
    {
      "id": 96,
      "intent": "partner",
      "answer": "partner",
      "questions": {
        "de": "Ich möchte Partner werden",
        "en": "I want to become a partner",
        "tr": "İş ortağı olmak istiyorum"
      }
    },
    {
      "id": 97,
      "intent": "driver_job",
      "answer": "driver_job",
      "questions": {
        "de": "Ich möchte als Fahrer arbeiten",
        "en": "I want to work as a driver",
        "tr": "Şoför olarak çalışmak istiyorum"
      }
    },
    {
      "id": 98,
      "intent": "app",
      "answer": "app",
      "questions": {
        "de": "Habt ihr eine App?",
        "en": "Do you have an app?",
        "tr": "Uygulamanız var mı?"
      }
    },
    {
      "id": 99,
      "intent": "app",
      "answer": "optional_app",
      "questions": {
        "de": "Muss ich die App installieren?",
        "en": "Do I have to install the app?",
        "tr": "Uygulamayı yüklemem şart mı?"
      }
    },
    {
      "id": 100,
      "intent": "tech",
      "answer": "login",
      "questions": {
        "de": "Ich kann mich nicht anmelden",
        "en": "I cannot log in",
        "tr": "Giriş yapamıyorum"
      }
    },
    {
      "id": 101,
      "intent": "password",
      "answer": "password",
      "questions": {
        "de": "Ich habe mein Passwort vergessen",
        "en": "I forgot my password",
        "tr": "Şifremi unuttum"
      }
    },
    {
      "id": 102,
      "intent": "tech",
      "answer": "tech",
      "questions": {
        "de": "Meine App funktioniert nicht",
        "en": "My app does not work",
        "tr": "Uygulamam çalışmıyor"
      }
    },
    {
      "id": 103,
      "intent": "missing_booking",
      "answer": "missing_booking",
      "questions": {
        "de": "Ich sehe meine Buchung nicht",
        "en": "I cannot see my booking",
        "tr": "Rezervasyonumu göremiyorum"
      }
    },
    {
      "id": 104,
      "intent": "ios",
      "answer": "ios",
      "questions": {
        "de": "Gibt es die App für iPhone?",
        "en": "Is the app available for iPhone?",
        "tr": "iPhone uygulaması var mı?"
      }
    },
    {
      "id": 105,
      "intent": "android",
      "answer": "android",
      "questions": {
        "de": "Gibt es die App für Android?",
        "en": "Is there an Android app?",
        "tr": "Android uygulaması var mı?"
      }
    },
    {
      "id": 106,
      "intent": "complaint",
      "answer": "complaint",
      "questions": {
        "de": "Der Fahrer war unfreundlich",
        "en": "The driver was rude",
        "tr": "Şoför kaba davrandı"
      }
    },
    {
      "id": 107,
      "intent": "missing_driver",
      "answer": "missing_driver",
      "questions": {
        "de": "Mein Taxi kommt nicht",
        "en": "My taxi is not arriving",
        "tr": "Taksim gelmiyor"
      }
    },
    {
      "id": 108,
      "intent": "lost",
      "answer": "lost",
      "questions": {
        "de": "Ich habe etwas im Taxi vergessen",
        "en": "I left something in the taxi",
        "tr": "Takside eşyamı unuttum"
      }
    },
    {
      "id": 109,
      "intent": "billing_problem",
      "answer": "billing_problem",
      "questions": {
        "de": "Ich habe zu viel bezahlt",
        "en": "I paid too much",
        "tr": "Fazla ödeme yaptım"
      }
    },
    {
      "id": 110,
      "intent": "complaint",
      "answer": "complaint",
      "questions": {
        "de": "Ich will mich beschweren",
        "en": "I want to complain",
        "tr": "Şikayet etmek istiyorum"
      }
    },
    {
      "id": 111,
      "intent": "danger",
      "answer": "danger",
      "questions": {
        "de": "Der Fahrer fährt gefährlich",
        "en": "The driver is driving dangerously",
        "tr": "Şoför tehlikeli kullanıyor"
      }
    },
    {
      "id": 112,
      "intent": "refund",
      "answer": "refund",
      "questions": {
        "de": "Ich will mein Geld zurück",
        "en": "I want a refund",
        "tr": "Paramı geri istiyorum"
      }
    },
    {
      "id": 113,
      "intent": "offtopic",
      "answer": "weather",
      "questions": {
        "de": "Wie wird das Wetter morgen?",
        "en": "What is the weather tomorrow?",
        "tr": "Yarın hava nasıl?"
      }
    },
    {
      "id": 114,
      "intent": "smalltalk",
      "answer": "joke",
      "questions": {
        "de": "Erzähl mir einen Witz",
        "en": "Tell me a joke",
        "tr": "Bir fıkra anlat"
      }
    },
    {
      "id": 115,
      "intent": "smalltalk",
      "answer": "paris",
      "questions": {
        "de": "Was ist die Hauptstadt von Frankreich?",
        "en": "What is the capital of France?",
        "tr": "Fransa'nın başkenti neresi?"
      }
    },
    {
      "id": 116,
      "intent": "offtopic",
      "answer": "money",
      "questions": {
        "de": "Kannst du mir Geld leihen?",
        "en": "Can you lend me money?",
        "tr": "Bana borç para verir misin?"
      }
    },
    {
      "id": 117,
      "intent": "offtopic",
      "answer": "offtopic",
      "questions": {
        "de": "Was kostet mein Auto in der Werkstatt?",
        "en": "How much will my car repair cost?",
        "tr": "Araç tamiri ne kadar tutar?"
      }
    },
    {
      "id": 118,
      "intent": "unknown",
      "answer": "unknown",
      "questions": {
        "de": "Unverständliche Nachricht",
        "en": "An unclear message",
        "tr": "Anlaşılmayan mesaj"
      }
    },
    {
      "id": 119,
      "intent": "unknown",
      "answer": "unknown",
      "questions": {
        "de": "Wiederholt unverständlich",
        "en": "Still unclear",
        "tr": "Hâlâ anlaşılmıyor"
      }
    },
    {
      "id": 120,
      "intent": "human",
      "answer": "human",
      "questions": {
        "de": "Ich will mit einem echten Menschen sprechen",
        "en": "I want to speak to a real person",
        "tr": "Gerçek bir insanla konuşmak istiyorum"
      }
    }
  ],
  "answers": {
    "greeting": {
      "de": "Hallo 👋 Ich bin Kardi, deine digitale Assistentin von ONRODA. Wie kann ich dir helfen?",
      "en": "Hello 👋 I’m Kardi, your digital ONRODA assistant. How can I help?",
      "tr": "Merhaba 👋 Ben ONRODA’nın dijital asistanı Kardi. Sana nasıl yardımcı olabilirim?"
    },
    "about": {
      "de": "ONRODA vermittelt Taxifahrten, Flughafentransfers und weitere angefragte Fahrten. Ich helfe dir bei Fragen und bei der Vorbereitung deiner Anfrage.",
      "en": "ONRODA connects you with taxi rides, airport transfers and other requested journeys. I can answer questions and help prepare your request.",
      "tr": "ONRODA taksi, havalimanı transferi ve diğer yolculuk taleplerine aracılık eder. Sorularını yanıtlayıp talebini hazırlamana yardımcı olabilirim."
    },
    "capabilities": {
      "de": "Ich beantworte hinterlegte Fragen und bereite deine Fahrt mit dir vor. Preise kommen ausschließlich aus dem ONRODA-Preisrechner; Buchung, Verfügbarkeit und individuelle Anliegen bestätigt das zuständige System oder unser Team.",
      "en": "I answer supported questions and help prepare your ride. Prices come only from ONRODA’s calculator; bookings, availability and individual matters require system or team confirmation.",
      "tr": "Desteklenen soruları yanıtlar, yolculuğunu hazırlamana yardımcı olurum. Fiyat yalnızca ONRODA hesaplayıcısından gelir; rezervasyon, uygunluk ve özel konuları sistem veya ekibimiz onaylar."
    },
    "identity": {
      "de": "Ich bin eine digitale, regelbasierte Assistentin – kein Mensch und kein frei antwortendes KI-Sprachmodell. Wenn ich etwas nicht sicher weiß, helfe ich dir zu unserem Team.",
      "en": "I’m a digital, rule-based assistant, not a human or a general AI language model. If I’m unsure, I can help you contact our team.",
      "tr": "Ben dijital, kural tabanlı bir asistanım; insan veya genel amaçlı bir yapay zeka modeli değilim. Emin olmadığımda ekibimize ulaşmana yardımcı olurum."
    },
    "region": {
      "de": "Unser Schwerpunkt liegt auf Stuttgart, Esslingen, Leinfelden-Echterdingen und Baden-Württemberg. Andere und längere Strecken kannst du anfragen; eine konkrete Verfügbarkeit muss bestätigt werden.",
      "en": "Our focus is Stuttgart, Esslingen, Leinfelden-Echterdingen and Baden-Württemberg. Other and longer routes can be requested; availability needs confirmation.",
      "tr": "Odağımız Stuttgart, Esslingen, Leinfelden-Echterdingen ve Baden-Württemberg. Başka ve uzun mesafeli güzergâhlar için de talep verebilirsin; uygunluk onaylanmalıdır."
    },
    "licensed": {
      "de": "ONRODA vermittelt Fahrten an konzessionierte Taxiunternehmen. Für Details findest du unsere Kontaktdaten und Anbieterinformationen im Impressum.",
      "en": "ONRODA connects rides with licensed taxi operators. Contact and provider details are in our legal notice.",
      "tr": "ONRODA ruhsatlı taksi işletmelerine yolculuk aracılığı yapar. İletişim ve işletme bilgileri künyede bulunur."
    },
    "contact": {
      "de": "Für eine persönliche Rückmeldung erreichst du unser Team über WhatsApp. Eine sofortige Antwort kann ich nicht versprechen.",
      "en": "You can reach our team on WhatsApp for a personal reply. I cannot promise an immediate response.",
      "tr": "Kişisel yanıt için WhatsApp üzerinden ekibimize ulaşabilirsin. Anında yanıt sözü veremem."
    },
    "price": {
      "de": "Gerne 😊 Ich brauche Start und Ziel möglichst genau. Mit deiner Bestätigung kann ich den bestehenden ONRODA-Preisrechner aufrufen.",
      "en": "Sure 😊 I need precise pickup and destination details. With your confirmation I can use the existing ONRODA fare calculator.",
      "tr": "Memnuniyetle 😊 Kalkış ve varış noktasını net olarak belirt. Onayınla mevcut ONRODA fiyat hesaplayıcısını kullanabilirim."
    },
    "fixed": {
      "de": "Für bestimmte Strecken kann unser Preisrechner einen Festpreis anbieten. Ob er möglich ist, entscheidet die bestehende ONRODA-Tariflogik – ich verspreche keinen freien Fixpreis.",
      "en": "Our calculator may offer a fixed fare for eligible routes. Existing ONRODA tariff rules decide eligibility; I cannot promise an unrestricted flat fare.",
      "tr": "Uygun güzergâhlarda hesaplayıcımız sabit fiyat sunabilir. Uygunluğu mevcut ONRODA tarife kuralları belirler; her yolculuğa sabit ücret sözü veremem."
    },
    "offer": {
      "de": "Gerne bereite ich deine Angebotsanfrage vor. Start und Ziel sind der erste Schritt; besondere Wünsche nimmt unser Team persönlich auf.",
      "en": "I can help prepare a quote request. Pickup and destination come first; our team handles special requests personally.",
      "tr": "Fiyat teklifi talebini hazırlayabilirim. Önce kalkış ve varış noktası; özel istekleri ekibimiz kişisel olarak değerlendirir."
    },
    "binding": {
      "de": "Eine Anzeige ist noch keine Buchungsbestätigung. Ein Festpreis gilt erst mit den bestätigten Leistungen und Bedingungen; eine Schätzung ist kein verbindlicher Festpreis.",
      "en": "A displayed price is not a booking confirmation. A fixed fare applies with confirmed services and conditions; an estimate is not a binding fixed fare.",
      "tr": "Gösterilen fiyat rezervasyon onayı değildir. Sabit fiyat onaylanan hizmet ve koşullara bağlıdır; tahmini fiyat kesin sabit fiyat değildir."
    },
    "per_person": {
      "de": "Der ONRODA-Rechner zeigt einen Fahrpreis für die angegebene Strecke und Fahrzeugklasse, keinen von mir berechneten Pro-Kopf-Preis. Für Gruppen oder mehrere Fahrzeuge lass das Angebot persönlich bestätigen.",
      "en": "The ONRODA calculator returns a fare for the route and vehicle class, not a per-person calculation by me. Group or multi-vehicle quotes need personal confirmation.",
      "tr": "ONRODA hesaplayıcısı güzergâh ve araç sınıfı için yolculuk fiyatı verir; ben kişi başı fiyat hesaplamam. Grup veya birden fazla araç teklifini ekibimiz onaylar."
    },
    "negotiation": {
      "de": "Ein individuelles Angebot oder einen Rabatt kann unser Team prüfen. Ich kann weder einen Nachlass noch tarifliche Ausnahmen zusagen.",
      "en": "Our team can review a custom quote or discount. I cannot promise discounts or tariff exceptions.",
      "tr": "Özel teklif veya indirimi ekibimiz değerlendirebilir. İndirim veya tarife istisnası sözü veremem."
    },
    "comparison": {
      "de": "Preise können sich nach Strecke, Tarif und Leistungen unterscheiden. Wir können den ONRODA-Preis für deine konkrete Strecke prüfen.",
      "en": "Prices can differ by route, tariff and service. We can check ONRODA’s fare for your exact journey.",
      "tr": "Fiyatlar güzergâh, tarife ve hizmete göre değişebilir. Yolculuğunun ONRODA fiyatını kontrol edebiliriz."
    },
    "extras": {
      "de": "Zusatzkosten richten sich nach dem geltenden Tarif oder bestätigten Angebot. Ich habe keine verifizierte Zuschlagsliste und möchte dir nichts Falsches nennen.",
      "en": "Extras depend on the applicable tariff or confirmed quote. I do not have a verified surcharge list and will not invent one.",
      "tr": "Ek ücretler geçerli tarifeye veya onaylanan teklife bağlıdır. Doğrulanmış ek ücret listem yok; yanlış bilgi vermek istemem."
    },
    "luggage_fee": {
      "de": "Gepäckmenge und Fahrzeuggröße müssen zusammenpassen. Ob besondere Gepäckstücke zusätzliche Kosten auslösen, lässt du dir bitte im konkreten Angebot bestätigen.",
      "en": "Luggage must fit the vehicle. Please confirm any extra charges for unusual items in your specific quote.",
      "tr": "Bagajın araca uygun olması gerekir. Özel eşyaların ek ücretini lütfen ilgili teklifte teyit ettir."
    },
    "waiting": {
      "de": "Wartezeit kann je nach Tarif oder vereinbartem Angebot Kosten auslösen. Ich kann keine kostenlose Wartezeit oder konkrete Gebühr zusagen.",
      "en": "Waiting may incur charges under the tariff or agreed quote. I cannot promise free waiting or a specific fee.",
      "tr": "Bekleme, tarifeye veya anlaşılan teklife göre ücretli olabilir. Ücretsiz bekleme veya belirli ücret sözü veremem."
    },
    "return": {
      "de": "Gerne nehmen wir Hin- und Rückfahrt getrennt auf. Für die Rückfahrt brauche ich ebenfalls Datum und Uhrzeit; ich verdopple nicht einfach einen Preis.",
      "en": "We can prepare outbound and return trips separately. The return also needs a date and time; I will not simply double a fare.",
      "tr": "Gidiş ve dönüşü ayrı hazırlayabiliriz. Dönüş için de tarih ve saat gerekir; fiyatı doğrudan ikiyle çarpmam."
    },
    "vehicle": {
      "de": "Einen schwarzen Mercedes E-Klasse Kombi kannst du bei uns anfragen 😊 Das konkrete Fahrzeug muss für deinen Termin bestätigt werden.",
      "en": "You can request a black Mercedes E-Class estate 😊 The specific car needs confirmation for your date.",
      "tr": "Siyah Mercedes E Serisi station wagon talep edebilirsin 😊 Belirli araç, tarihin için onaylanmalıdır."
    },
    "special_vehicle": {
      "de": "Diesen Fahrzeugwunsch nimmt unser Team gerne auf. Eine S-Klasse, ein Elektrofahrzeug oder eine bestimmte Ausstattung kann ich nicht als verfügbar bestätigen.",
      "en": "Our team can review that vehicle preference. I cannot confirm an S-Class, an electric vehicle or specific equipment as available.",
      "tr": "Ekibimiz araç tercihini değerlendirebilir. S Serisi, elektrikli araç veya belirli donanımın uygunluğunu ben onaylayamam."
    },
    "clean": {
      "de": "Gepflegte Fahrzeuge sind Teil unseres Angebots. Bei einer konkreten Beanstandung kannst du dich direkt an unser Team wenden.",
      "en": "Well-kept vehicles are part of our service. For a specific concern, please contact our team.",
      "tr": "Bakımlı araçlar hizmetimizin bir parçasıdır. Belirli bir sorun için doğrudan ekibimize ulaşabilirsin."
    },
    "equipment": {
      "de": "Sag uns bitte, welche Ausstattung dir wichtig ist. Unser Team prüft sie für das tatsächlich angebotene Fahrzeug.",
      "en": "Tell us which equipment you need. Our team checks it for the actual vehicle offered.",
      "tr": "Hangi donanıma ihtiyacın olduğunu belirt. Ekibimiz teklif edilen araç için kontrol eder."
    },
    "colour": {
      "de": "Schwarz kannst du als Fahrzeugwunsch angeben. Farbe und Modell bestätigt unser Team nach Verfügbarkeit.",
      "en": "You can request a black car. Our team confirms colour and model subject to availability.",
      "tr": "Siyah araç isteğini belirtebilirsin. Renk ve modeli ekibimiz uygunluğa göre onaylar."
    },
    "luggage": {
      "de": "Unsere Kombis können zusätzlichen Gepäckraum bieten. Wie viele Personen und welche Koffer fahren mit? Eine sichere Platzbestätigung übernimmt unser Team.",
      "en": "Our estate cars can offer extra luggage space. How many passengers and what luggage are travelling? Our team confirms whether it fits safely.",
      "tr": "Station wagon araçlarımız ek bagaj alanı sunabilir. Kaç kişi ve hangi valizlerle seyahat ediyorsunuz? Güvenli şekilde sığıp sığmadığını ekibimiz onaylar."
    },
    "large_luggage": {
      "de": "Bei so viel Gepäck sollte unser Team die Fahrzeugplanung persönlich übernehmen. Ich bereite dir dafür eine übersichtliche Anfrage vor.",
      "en": "With that much luggage our team should plan the vehicles personally. I can prepare a clear request for you.",
      "tr": "Bu kadar bagaj için araç planlamasını ekibimiz kişisel olarak yapmalı. Düzenli bir talep hazırlayabilirim."
    },
    "stroller": {
      "de": "Ist der Kinderwagen zusammenklappbar? Wie viele Personen und Koffer kommen dazu?",
      "en": "Is the stroller foldable? How many passengers and suitcases are coming too?",
      "tr": "Bebek arabası katlanabilir mi? Kaç kişi ve kaç valiz daha olacak?"
    },
    "bicycle": {
      "de": "Ist dein Fahrrad zusammenklappbar oder transportfertig verpackt? Die sichere Mitnahme muss unser Team mit dem Fahrzeug abstimmen.",
      "en": "Is your bicycle foldable or packed for transport? Our team must arrange safe carriage with the vehicle.",
      "tr": "Bisikletin katlanabilir veya taşımaya uygun paketli mi? Güvenli taşımayı ekibimiz araçla birlikte planlamalı."
    },
    "accessibility": {
      "de": "Benötigst du während der Fahrt einen Rollstuhlplatz oder kannst du auf einen Fahrzeugsitz umsteigen? Die passende Ausstattung muss persönlich bestätigt werden; medizinische Details brauche ich hier nicht.",
      "en": "Do you need to remain in your wheelchair or can you transfer to a car seat? Suitable equipment needs personal confirmation; I do not need medical details here.",
      "tr": "Yolculukta tekerlekli sandalyende mi kalmalısın, yoksa araç koltuğuna geçebilir misin? Uygun donanım kişisel olarak onaylanmalı; burada tıbbi ayrıntı gerekmiyor."
    },
    "bulky": {
      "de": "Welche Maße hat der Gegenstand und ist er sicher verpackt? Unser Team muss prüfen, ob ein sicherer Transport möglich ist.",
      "en": "What are the item’s dimensions and is it safely packed? Our team must check whether safe transport is possible.",
      "tr": "Eşyanın ölçüleri nedir ve güvenli paketlenmiş mi? Güvenli taşımanın mümkün olup olmadığını ekibimiz kontrol etmeli."
    },
    "dog": {
      "de": "Wie groß ist dein Hund? Die Mitnahme stimmen wir bitte vorher mit unserem Team ab.",
      "en": "How big is your dog? Please arrange carriage with our team in advance.",
      "tr": "Köpeğin ne büyüklükte? Taşımayı lütfen önceden ekibimizle görüş."
    },
    "cat": {
      "de": "Ist deine Katze in einer geeigneten Transportbox? Unser Team stimmt die Mitnahme mit dir ab.",
      "en": "Is your cat in a suitable carrier? Our team can arrange carriage with you.",
      "tr": "Kedin uygun bir taşıma kutusunda mı? Ekibimiz taşımayı seninle planlayabilir."
    },
    "backpack": {
      "de": "Alles klar, dann ist der Gepäckbedarf gering 😊 Für die passende Fahrt brauche ich noch Start und Ziel.",
      "en": "That sounds like light luggage 😊 I still need pickup and destination to prepare a ride.",
      "tr": "Anlaşıldı, az bagajın var 😊 Yolculuğu hazırlamak için kalkış ve varış noktasına ihtiyacım var."
    },
    "airport": {
      "de": "Gerne ✈️ Geht es zum Flughafen oder möchtest du dort abgeholt werden?",
      "en": "Of course ✈️ Are you going to the airport or being picked up there?",
      "tr": "Memnuniyetle ✈️ Havalimanına mı gidiyorsun, yoksa oradan mı alınacaksın?"
    },
    "departure": {
      "de": "Von welchem Flughafen fliegst du und wo startest du? Deine Abflugzeit ist nicht automatisch deine Abholzeit.",
      "en": "Which airport are you flying from and where is your pickup? Your departure time is not automatically your pickup time.",
      "tr": "Hangi havalimanından uçuyorsun ve nereden alınacaksın? Uçuş saati otomatik olarak alınma saati değildir."
    },
    "arrival": {
      "de": "An welchem Flughafen landest du und wie lautet deine Flugnummer? Die passende Abholzeit stimmen wir gesondert ab.",
      "en": "Which airport are you arriving at and what is your flight number? Pickup time needs separate agreement.",
      "tr": "Hangi havalimanına iniyorsun ve uçuş numaran nedir? Alınma saati ayrıca kararlaştırılır."
    },
    "flight": {
      "de": "Unser Team prüft Flugnummern und mögliche Verspätungen. Ich selbst rufe keine Live-Flugdaten ab und bestätige keine automatisch geänderte Abholzeit.",
      "en": "Our team checks flight numbers and possible delays. I do not retrieve live flight data or confirm automatically changed pickup times.",
      "tr": "Ekibimiz uçuş numaralarını ve olası gecikmeleri kontrol eder. Ben canlı uçuş verisi almam veya otomatik değişen alınma saatini onaylamam."
    },
    "meeting": {
      "de": "Den genauen Treffpunkt findest du in bestätigten Buchungsinformationen oder klärst ihn mit unserem Team. Ich erfinde keinen Terminal oder Fahrerstandort.",
      "en": "Check your confirmed booking information or our team for the exact meeting point. I will not invent a terminal or driver location.",
      "tr": "Kesin buluşma noktasını onaylı rezervasyon bilgilerinden veya ekibimizden öğrenebilirsin. Terminal ya da şoför konumu uydurmam."
    },
    "cancelled_flight": {
      "de": "Das tut mir leid. Falls du bereits gebucht hast, öffne bitte deine Fahrt in der App oder kontaktiere unser Team für eine Änderung oder Stornierung.",
      "en": "I’m sorry to hear that. If already booked, open your ride in the app or contact our team to request a change or cancellation.",
      "tr": "Üzüldüm. Rezervasyon yaptıysan değişiklik veya iptal için uygulamadaki yolculuğunu aç ya da ekibimize ulaş."
    },
    "no_flight": {
      "de": "Kein Problem. Flugnummer kann zunächst offen bleiben; Flughafen, Reisetag und Uhrzeit helfen unserem Team bei der Abstimmung.",
      "en": "No problem. The flight number can remain open for now; airport, travel date and time help our team arrange pickup.",
      "tr": "Sorun değil. Uçuş numarası şimdilik boş kalabilir; havalimanı, tarih ve saat ekibimizin planlamasına yardımcı olur."
    },
    "offline_airport": {
      "de": "Dann vereinbare Treffpunkt und Kontaktmöglichkeit bitte vor der Reise mit unserem Team. Ich kann keine Abholung ohne bestätigte Abstimmung zusagen.",
      "en": "Please agree a meeting point and contact method with our team before travelling. I cannot promise pickup without confirmed arrangements.",
      "tr": "Buluşma yeri ve iletişim yolunu seyahatten önce ekibimizle kararlaştır. Onaylı plan olmadan alınma sözü veremem."
    },
    "booking": {
      "de": "Ich kann die Anfrage vorbereiten. Gebucht ist erst, wenn App oder Team die Fahrt tatsächlich bestätigen.",
      "en": "I can prepare the request. It is only booked when the app or team actually confirms the ride.",
      "tr": "Talebi hazırlayabilirim. Uygulama veya ekip gerçekten onayladığında rezervasyon yapılmış olur."
    },
    "reservation": {
      "de": "Eine spätere Fahrt kannst du anfragen. Für eine konkrete Reservierung brauchen wir Datum, Uhrzeit und Strecke.",
      "en": "You can request a future ride. A specific reservation needs a date, time and route.",
      "tr": "İleri tarihli yolculuk talep edebilirsin. Belirli rezervasyon için tarih, saat ve güzergâh gerekir."
    },
    "status": {
      "de": "Deinen bestätigten Fahrtstatus findest du in der App. Ich habe hier keinen Zugriff auf deine Buchung, Fahrerposition oder Ankunftszeit.",
      "en": "Check the app for confirmed ride status. I do not have access to your booking, driver position or arrival time here.",
      "tr": "Onaylı yolculuk durumunu uygulamada görebilirsin. Burada rezervasyonuna, şoför konumuna veya varış saatine erişimim yok."
    },
    "change": {
      "de": "Bestehende Fahrten änderst du über die verfügbaren Funktionen in der App oder mit unserem Team. Hier kann ich nur deine neue Anfrage vorbereiten.",
      "en": "Use the available app functions or our team to change an existing ride. Here I can only prepare a request.",
      "tr": "Mevcut yolculuğu uygulamadaki seçeneklerden veya ekibimizle değiştirebilirsin. Burada yalnızca talep hazırlayabilirim."
    },
    "cancel": {
      "de": "Öffne deine Fahrt in der App, um die angezeigte Stornierung zu nutzen. Bedingungen und mögliche Kosten richten sich nach dem tatsächlichen Status; ich storniere hier nichts.",
      "en": "Open the ride in the app to use its cancellation option. Conditions and possible fees depend on actual status; I do not cancel rides here.",
      "tr": "İptal seçeneği için yolculuğunu uygulamada aç. Koşullar ve olası ücretler gerçek duruma bağlıdır; burada iptal işlemi yapmam."
    },
    "two_rides": {
      "de": "Möchtest du eine Fahrt ändern, stornieren oder den Status ansehen? Das geht in deiner App oder persönlich mit unserem Team.",
      "en": "Do you want to change or cancel a ride, or check its status? Use your app or contact our team.",
      "tr": "Bir yolculuğu değiştirmek, iptal etmek veya durumuna bakmak mı istiyorsun? Uygulamayı kullanabilir veya ekibimize ulaşabilirsin."
    },
    "stops": {
      "de": "Zusätzliche Stopps musst du bei der Anfrage angeben. Strecke und Preis müssen dazu passen; ich sage keinen unveränderten Preis zu.",
      "en": "Include extra stops in your request. Route and price must account for them; I cannot promise an unchanged fare.",
      "tr": "Ek durakları talebinde belirt. Güzergâh ve fiyat buna uygun olmalı; aynı fiyatı garanti edemem."
    },
    "other_person": {
      "de": "Eine Fahrt für eine andere Person kannst du anfragen. Kläre die nötigen Abholinformationen in der App oder mit unserem Team; sensible Daten brauche ich hier nicht.",
      "en": "You can request a ride for someone else. Arrange necessary pickup details in the app or with our team; I do not need sensitive data here.",
      "tr": "Başka biri için yolculuk talep edebilirsin. Gerekli alınma bilgilerini uygulamada veya ekibimizle görüş; burada hassas veri gerekmiyor."
    },
    "uncertain_time": {
      "de": "Wir können die Strecke schon vorbereiten. Für eine konkrete Reservierungsanfrage brauchst du später noch Datum und Uhrzeit.",
      "en": "We can prepare the route now. A specific reservation request will still need a date and time later.",
      "tr": "Güzergâhı şimdiden hazırlayabiliriz. Belirli rezervasyon talebi için daha sonra tarih ve saat gerekir."
    },
    "group": {
      "de": "Für mehrere Personen müssen Sitzplätze und Gepäck gemeinsam passen. Ich bestätige keine Kapazität; unser Team stimmt das geeignete Fahrzeug mit dir ab.",
      "en": "Seats and luggage space must fit the whole group. I cannot confirm capacity; our team arranges the right vehicle.",
      "tr": "Koltuk ve bagaj alanı grubun tamamına uygun olmalı. Kapasite onaylayamam; uygun aracı ekibimiz planlar."
    },
    "large_group": {
      "de": "Für eine größere Gruppe oder mehrere Autos ist persönliche Planung sinnvoll. Ich kann Strecke, Termin, Personen und Gepäck für unser Team zusammenstellen.",
      "en": "Large groups or multiple cars need personal planning. I can compile route, date, passengers and luggage for our team.",
      "tr": "Büyük gruplar veya birden fazla araç için kişisel planlama gerekir. Güzergâh, tarih, kişi ve bagaj bilgilerini ekibimize hazırlayabilirim."
    },
    "child": {
      "de": "Wie viele Kinder fahren mit und welches Alter haben sie? Einen passenden Kindersitz muss unser Team vorab bestätigen.",
      "en": "How many children are travelling and how old are they? Our team must confirm suitable child seats in advance.",
      "tr": "Kaç çocuk var ve yaşları kaç? Uygun çocuk koltuğunu ekibimiz önceden onaylamalı."
    },
    "senior": {
      "de": "Benötigt die Person Hilfe beim Ein- und Aussteigen? Besondere Anforderungen stimmen wir persönlich ab; medizinische Angaben sind hier nicht nötig.",
      "en": "Does the passenger need help getting in and out? Special requirements should be arranged personally; medical details are not needed here.",
      "tr": "Kişinin binme ve inmede yardıma ihtiyacı var mı? Özel ihtiyaçları kişisel olarak görüşelim; burada tıbbi bilgi gerekmiyor."
    },
    "medical": {
      "de": "Geplante Krankenfahrten ohne akute Notfallsituation kannst du anfragen. Medizinische Betreuung oder Kostenübernahme kann ich nicht bestätigen.",
      "en": "You can request planned non-emergency medical transport. I cannot confirm medical supervision or insurance coverage.",
      "tr": "Akut acil olmayan planlı hasta ulaşımı talep edebilirsin. Tıbbi refakat veya sigorta ödemesini onaylayamam."
    },
    "medical_document": {
      "de": "Unterlagen und mögliche Kostenübernahme müssen zuständig geprüft werden. Bitte sende hier keine Diagnosen oder Dokumentfotos; unser Team hilft beim passenden nächsten Schritt.",
      "en": "Documents and possible coverage require proper review. Please do not send diagnoses or document photos here; our team can guide you.",
      "tr": "Belgeler ve ödeme kapsamı ilgili birimce incelenmeli. Buraya teşhis veya belge fotoğrafı gönderme; ekibimiz sonraki adımı açıklayabilir."
    },
    "medical_emergency": {
      "de": "Bei einem akuten medizinischen Notfall rufe bitte sofort 112. Ein Taxi und dieser Chat ersetzen keinen Rettungsdienst.",
      "en": "For a medical emergency call 112 immediately. A taxi and this chat are not emergency medical services.",
      "tr": "Tıbbi acil durumda hemen 112’yi ara. Taksi ve bu sohbet acil sağlık hizmetinin yerini tutmaz."
    },
    "payment": {
      "de": "Klar, bar oder mit Kreditkarte geht beides 😊",
      "en": "Yes, cash or credit card are both possible 😊",
      "tr": "Evet, nakit veya kredi kartı ile ödeme mümkün 😊"
    },
    "wallet": {
      "de": "Apple Pay oder andere Wallets sind hier nicht als verfügbar bestätigt. Bar- und Kreditkartenzahlung sind möglich; spezielle Wallets bitte vorher mit dem Team klären.",
      "en": "Apple Pay and other wallets are not confirmed here. Cash and credit card are possible; check specific wallets with our team first.",
      "tr": "Apple Pay ve diğer cüzdanlar burada doğrulanmış değil. Nakit ve kredi kartı mümkün; özel cüzdanları önce ekibimize sor."
    },
    "invoice": {
      "de": "Eine Firmenabrechnung können wir persönlich prüfen. Handelt es sich um eine Geschäfts- oder Firmenfahrt?",
      "en": "We can review company invoicing personally. Is this a business or company ride?",
      "tr": "Şirket faturalandırmasını kişisel olarak değerlendirebiliriz. Bu bir iş veya şirket yolculuğu mu?"
    },
    "receipt": {
      "de": "Fahrtinformationen und Belege werden in der App bereitgestellt. Wenn dir ein Beleg fehlt, hilft unser Team anhand der Fahrt weiter.",
      "en": "Ride information and receipts are provided in the app. If a receipt is missing, our team can help identify the ride.",
      "tr": "Yolculuk bilgileri ve belgeler uygulamada sunulur. Belge eksikse ekibimiz yolculuk bilgileriyle yardımcı olabilir."
    },
    "tip": {
      "de": "Trinkgeld ist freiwillig. Welche Zahlungsweise dafür möglich ist, klärst du bitte direkt beim Bezahlen.",
      "en": "Tipping is optional. Please check the available method when paying.",
      "tr": "Bahşiş isteğe bağlıdır. Uygun ödeme şeklini ödeme sırasında sorabilirsin."
    },
    "prepayment": {
      "de": "Der Zeitpunkt einer Belastung hängt von der bestätigten Zahlungsweise ab. Ich habe hier keinen Zugriff auf deine Zahlungen; bitte prüfe deine Buchungsinformationen oder frage unser Team.",
      "en": "Charge timing depends on the confirmed payment method. I cannot access payments here; check your booking information or ask our team.",
      "tr": "Ödemenin alınma zamanı onaylanan yönteme bağlıdır. Burada ödemelerine erişemem; rezervasyon bilgilerini kontrol et veya ekibimize sor."
    },
    "after_payment": {
      "de": "Bar- und Kreditkartenzahlung sind möglich. Den genauen Zahlungsablauf deiner Fahrt findest du in den bestätigten Buchungsinformationen.",
      "en": "Cash and credit card are possible. Your confirmed booking information explains the payment process for the ride.",
      "tr": "Nakit ve kredi kartı mümkün. Yolculuğunun ödeme süreci onaylı rezervasyon bilgilerinde bulunur."
    },
    "regular": {
      "de": "Für regelmäßige Fahrten kann unser Team eine Zusammenarbeit prüfen. Welche Strecke und wie häufig benötigt ihr die Fahrt?",
      "en": "Our team can review arrangements for regular rides. Which route and how often do you need it?",
      "tr": "Düzenli yolculuklar için ekibimiz iş birliğini değerlendirebilir. Hangi güzergâhta ve ne sıklıkta ihtiyacınız var?"
    },
    "hotel": {
      "de": "Für Hotels können wir die Vermittlung von Gästefahrten besprechen. Unser Team prüft die passende Zusammenarbeit.",
      "en": "We can discuss guest ride arrangements for hotels. Our team reviews the suitable partnership.",
      "tr": "Oteller için misafir yolculuklarını görüşebiliriz. Uygun iş birliğini ekibimiz değerlendirir."
    },
    "business": {
      "de": "Geht es um Mitarbeiterfahrten, Flughafentransfers oder einzelne Geschäftsreisen? Unser Team hilft bei der passenden Abwicklung.",
      "en": "Do you need employee rides, airport transfers or individual business trips? Our team can help with arrangements.",
      "tr": "Personel yolculukları, havalimanı transferleri veya tekil iş seyahatleri mi gerekiyor? Ekibimiz uygun çözüm için yardımcı olur."
    },
    "contract": {
      "de": "Das hängt von der gewünschten Zusammenarbeit ab. Verträge und Sonderkonditionen besprichst du bitte persönlich mit unserem Team.",
      "en": "That depends on the arrangement. Please discuss contracts and special terms personally with our team.",
      "tr": "İstenen iş birliğine bağlıdır. Sözleşme ve özel koşulları lütfen ekibimizle kişisel olarak görüş."
    },
    "hotel_guests": {
      "de": "Gäste können die vorhandene ONRODA-App nutzen oder persönlich anfragen. Spezielle Hotel-Buchungswege stimmt unser Team mit euch ab.",
      "en": "Guests can use the existing ONRODA app or make a personal request. Our team can discuss hotel-specific booking options.",
      "tr": "Misafirler mevcut ONRODA uygulamasını kullanabilir veya kişisel talep verebilir. Otele özel rezervasyon yollarını ekibimizle görüşebilirsiniz."
    },
    "chauffeur": {
      "de": "Einen hochwertigen Transfer kannst du persönlich anfragen. Ich kann keinen eigenständigen Chauffeur-Tarif oder ein bestimmtes Fahrzeug zusagen.",
      "en": "You can personally request a premium transfer. I cannot promise a separate chauffeur tariff or specific vehicle.",
      "tr": "Premium transferi kişisel olarak talep edebilirsin. Ayrı şoförlü hizmet tarifesi veya belirli araç sözü veremem."
    },
    "partner": {
      "de": "Gerne 😊 Bist du Taxiunternehmer, Hotel oder Unternehmen? Auf unserer Website findest du den bestehenden Partner-Anfrageweg.",
      "en": "Of course 😊 Are you a taxi operator, hotel or company? Our website has the existing partner enquiry route.",
      "tr": "Memnuniyetle 😊 Taksi işletmesi, otel veya şirket misin? Web sitemizde mevcut iş ortaklığı başvuru yolu var."
    },
    "driver_job": {
      "de": "Danke für dein Interesse! Unser Team ist der passende Kontakt für deine Anfrage als Fahrer; ich nehme hier keine Bewerbung verbindlich an.",
      "en": "Thank you for your interest! Our team is the right contact for driver enquiries; I do not formally accept applications here.",
      "tr": "İlgin için teşekkürler! Şoförlük başvurusu için ekibimiz doğru iletişim noktasıdır; burada resmi başvuru kabul etmiyorum."
    },
    "app": {
      "de": "Den vorhandenen iPhone-App-Link findest du unten. Für Android zeige ich nur einen Link, wenn er auf der Website tatsächlich eingerichtet ist.",
      "en": "The existing iPhone app link is below. I only show an Android link if one is actually configured on the website.",
      "tr": "Mevcut iPhone uygulama bağlantısı aşağıda. Android bağlantısını ancak web sitesinde gerçekten ayarlıysa gösteririm."
    },
    "optional_app": {
      "de": "Für eine persönliche Anfrage über WhatsApp brauchst du unsere App nicht. Die vorhandene digitale Buchung erfolgt über die App; ich erfinde keinen Web-Buchungsweg.",
      "en": "You do not need our app for a personal WhatsApp request. Existing digital booking uses the app; I will not invent a web booking route.",
      "tr": "WhatsApp üzerinden kişisel talep için uygulamamız şart değil. Mevcut dijital rezervasyon uygulamada yapılır; olmayan web rezervasyon yolu sunmam."
    },
    "login": {
      "de": "Welche Fehlermeldung siehst du? Bitte sende kein Passwort oder Anmelde-Token; bei unklaren Fehlern hilft unser Team.",
      "en": "What error message do you see? Do not send passwords or login tokens; our team can help with unclear errors.",
      "tr": "Hangi hata mesajını görüyorsun? Şifre veya giriş belirteci gönderme; belirsiz hatalarda ekibimiz yardımcı olur."
    },
    "password": {
      "de": "Nutze die Funktion zum Zurücksetzen, wenn sie in der App angezeigt wird. Bitte teile dein Passwort niemals hier; falls es nicht klappt, kontaktiere unser Team.",
      "en": "Use the reset function if available in the app. Never share your password here; contact our team if it does not work.",
      "tr": "Uygulamada varsa sıfırlama işlevini kullan. Şifreni burada asla paylaşma; çalışmazsa ekibimize ulaş."
    },
    "tech": {
      "de": "Nutzt du iPhone oder Android, und was funktioniert nicht? Bitte sende keine Passwörter oder Zahlungsdaten.",
      "en": "Are you using iPhone or Android, and what is not working? Please do not send passwords or payment details.",
      "tr": "iPhone mu Android mi kullanıyorsun ve ne çalışmıyor? Lütfen şifre veya ödeme bilgisi gönderme."
    },
    "missing_booking": {
      "de": "Prüfe, ob du im richtigen Konto angemeldet bist. Falls die Fahrt fehlt, hilft unser Team; ich kann keine Buchung hier als vorhanden oder bestätigt ausgeben.",
      "en": "Check that you are signed in to the correct account. If the ride is missing, our team can help; I cannot confirm a booking here.",
      "tr": "Doğru hesaba giriş yaptığını kontrol et. Yolculuk eksikse ekibimiz yardımcı olabilir; burada rezervasyon varlığı veya onayı veremem."
    },
    "ios": {
      "de": "Ja, ONRODA ist für iPhone im App Store verfügbar. Nutze den vorhandenen offiziellen Link.",
      "en": "Yes, ONRODA is available for iPhone in the App Store. Use the existing official link.",
      "tr": "Evet, ONRODA iPhone için App Store’da mevcut. Var olan resmi bağlantıyı kullan."
    },
    "android": {
      "de": "Auf der Website ist Google Play bisher als „folgt“ gekennzeichnet. Ohne verifizierten Link verspreche ich keine verfügbare Android-Installation; persönlich anfragen kannst du auch ohne App.",
      "en": "The website currently marks Google Play as coming soon. Without a verified link I cannot promise Android installation; you can make a personal request without the app.",
      "tr": "Web sitesinde Google Play şu anda yakında olarak belirtiliyor. Doğrulanmış bağlantı olmadan Android kurulumu sözü veremem; uygulamasız kişisel talep verebilirsin."
    },
    "complaint": {
      "de": "Das tut mir leid. Unser Team sollte dein Anliegen persönlich prüfen. Ich kann deine Beschreibung für WhatsApp vorbereiten, ohne eine Lösung oder Erstattung zu versprechen.",
      "en": "I’m sorry. Our team should review this personally. I can prepare your description for WhatsApp without promising a resolution or refund.",
      "tr": "Üzüldüm. Ekibimiz konuyu kişisel olarak incelemeli. Çözüm veya iade sözü vermeden açıklamanı WhatsApp için hazırlayabilirim."
    },
    "missing_driver": {
      "de": "Das ist ärgerlich. Öffne bitte den tatsächlichen Fahrtstatus in deiner App und kontaktiere bei Bedarf unser Team; ich habe hier keine Live-Fahrerdaten.",
      "en": "That is frustrating. Check the actual ride status in your app and contact our team if needed; I do not have live driver data here.",
      "tr": "Bu can sıkıcı. Uygulamadaki gerçek yolculuk durumuna bakıp gerekirse ekibimize ulaş; burada canlı şoför verim yok."
    },
    "lost": {
      "de": "Unser Team hilft bei Fundsachen. Halte bitte Fahrtzeitpunkt und Buchungsnummer bereit, falls vorhanden; ich kann keinen Gegenstand als gefunden bestätigen.",
      "en": "Our team handles lost property. Have the ride time and booking reference ready if available; I cannot confirm that an item was found.",
      "tr": "Kayıp eşyalarla ekibimiz ilgilenir. Varsa yolculuk zamanı ve rezervasyon numarasını hazır bulundur; eşyanın bulunduğunu onaylayamam."
    },
    "billing_problem": {
      "de": "Bitte halte Fahrtinformationen und gegebenenfalls den Beleg bereit. Unser Team kann die Abrechnung prüfen; ich ändere keine Zahlung.",
      "en": "Please have ride details and any receipt ready. Our team can review the charge; I do not change payments.",
      "tr": "Yolculuk bilgileri ve varsa belgeyi hazır bulundur. Ekibimiz ücreti inceleyebilir; ben ödeme değiştirmem."
    },
    "danger": {
      "de": "Wenn du aktuell in Gefahr bist, rufe bitte die Polizei unter 110. Deine Sicherheit geht vor; eine Beschwerde kann danach unser Team prüfen.",
      "en": "If you are in immediate danger, call the police on 110. Your safety comes first; our team can review a complaint afterwards.",
      "tr": "Şu anda tehlikedeysen polisi 110’dan ara. Güvenliğin öncelikli; sonrasında şikayeti ekibimiz inceleyebilir."
    },
    "refund": {
      "de": "Eine Erstattung muss unser Team anhand deiner Fahrt prüfen. Ich kann sie weder zusagen noch auslösen.",
      "en": "Our team must review any refund against your ride. I cannot promise or issue one.",
      "tr": "İadeyi ekibimiz yolculuğuna göre incelemeli. İade sözü veremem veya başlatamam."
    },
    "weather": {
      "de": "Ich habe keine Live-Wetterdaten. Wenn es um eine wetterbedingte Fahrtänderung geht, hilft unser Team.",
      "en": "I do not have live weather data. For a weather-related ride change, our team can help.",
      "tr": "Canlı hava durumu verim yok. Hava nedeniyle yolculuk değişikliği için ekibimiz yardımcı olabilir."
    },
    "joke": {
      "de": "Warum nimmt der Koffer ein Taxi? Weil er nicht mehr getragen werden wollte 😊",
      "en": "Why did the suitcase take a taxi? It was tired of being carried 😊",
      "tr": "Valiz neden taksiye binmiş? Taşınmaktan yorulmuş 😊"
    },
    "paris": {
      "de": "Paris 😊 Bei Fragen zu ONRODA helfe ich dir ebenfalls gerne.",
      "en": "Paris 😊 I’m also happy to help with ONRODA questions.",
      "tr": "Paris 😊 ONRODA sorularında da memnuniyetle yardımcı olurum."
    },
    "money": {
      "de": "Dabei kann ich dir nicht helfen. Hast du eine Frage zu einer ONRODA-Fahrt?",
      "en": "I cannot help with that. Do you have a question about an ONRODA ride?",
      "tr": "Bu konuda yardımcı olamam. ONRODA yolculuğu hakkında sorun var mı?"
    },
    "offtopic": {
      "de": "Dazu habe ich keine verlässliche Auskunft. Ich helfe dir bei ONRODA-Fahrten und den dazugehörigen Fragen.",
      "en": "I do not have reliable information on that. I can help with ONRODA rides and related questions.",
      "tr": "Bu konuda güvenilir bilgim yok. ONRODA yolculukları ve ilgili sorularda yardımcı olabilirim."
    },
    "unknown": {
      "de": "Ich habe dein Anliegen noch nicht sicher verstanden. Geht es um eine Fahrt, einen Preis oder persönliche Hilfe?",
      "en": "I have not understood your request yet. Is it about a ride, a price or personal help?",
      "tr": "İsteğini henüz tam anlayamadım. Yolculuk, fiyat veya kişisel yardım hakkında mı?"
    },
    "human": {
      "de": "Natürlich 😊 Unser Team hilft dir persönlich. Ich zeige dir die Zusammenfassung vor dem Öffnen von WhatsApp; versendet wird erst durch dich.",
      "en": "Of course 😊 Our team can help personally. I show the summary before opening WhatsApp; only you send the message.",
      "tr": "Elbette 😊 Ekibimiz kişisel olarak yardımcı olur. WhatsApp açılmadan önce özeti gösteririm; mesajı yalnızca sen gönderirsin."
    }
  }
};if(typeof module!=="undefined"&&module.exports)module.exports=data;else root.KardelenKnowledge=data;})(typeof globalThis!=="undefined"?globalThis:this);
