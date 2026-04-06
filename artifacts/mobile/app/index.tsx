import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

// Wichtig für den Google Login Rückweg
WebBrowser.maybeCompleteAuthSession();

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        {/* Branding Sektion */}
        <View style={styles.brandContainer}>
          <Text style={styles.logoText}>OR</Text>
          <Text style={styles.brandName}>Onroda</Text>
          <View style={styles.redLine} />
          <Text style={styles.slogan}>Move Your Way.</Text>
        </View>

        {/* Login Karte */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Willkommen</Text>
          
          <TouchableOpacity 
            style={styles.googleButton} 
            onPress={() => router.push("/profile")}
          >
            <Ionicons name="logo-google" size={20} color="white" style={{ marginRight: 10 }} />
            <Text style={styles.buttonText}>Weiter mit Google</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={() => router.push("/profile")}
          >
            <Text style={styles.linkText}>Neu bei Onroda? <Text style={{ fontWeight: 'bold' }}>Jetzt registrieren</Text></Text>
          </TouchableOpacity>
        </View>

        {/* Footer für Fahrer */}
        <TouchableOpacity 
          style={styles.footer} 
          onPress={() => router.push("/driver/login")}
        >
          <Text style={styles.footerText}>Du bist Partner oder Fahrer? <Text style={{ color: '#E31212' }}>Hier anmelden</Text></Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center' },
  brandContainer: { alignItems: 'center', marginBottom: 50 },
  logoText: { fontSize: 40, fontWeight: '900', color: '#000' },
  brandName: { fontSize: 24, fontWeight: '300', letterSpacing: 2 },
  redLine: { width: 40, height: 4, backgroundColor: '#E31212', marginVertical: 15 },
  slogan: { fontSize: 16, color: '#666', fontStyle: 'italic' },
  card: { width: '100%', backgroundColor: '#F8F8F8', borderRadius: 20, padding: 25, alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10 },
  cardTitle: { fontSize: 20, fontWeight: '600', marginBottom: 20 },
  googleButton: { flexDirection: 'row', backgroundColor: '#000', width: '100%', height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  linkButton: { marginTop: 20 },
  linkText: { color: '#444', fontSize: 14 },
  footer: { position: 'absolute', bottom: 40 },
  footerText: { fontSize: 14, color: '#888' }
});