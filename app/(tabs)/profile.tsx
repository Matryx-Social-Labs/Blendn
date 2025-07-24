import React, { useEffect, useState } from 'react'
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'

interface UserProfile {
  id: string
  name: string
  age: number
  location: string
  interests: string[]
  onboarded: boolean
  profile_photos?: string[]
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getUserAndProfile()
  }, [])

  const getUserAndProfile = async () => {
    try {
      console.log('🔍 [PROFILE] Starting getUserAndProfile...');
      console.log('🔍 [PROFILE] Supabase client initialized:', !!supabase);
      
      // Test basic database connectivity first
      console.log('🧪 [DB_TEST] Starting comprehensive database diagnostics...');
      console.log('🧪 [DB_TEST] Step 1: Testing Supabase URL reachability');
      
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      console.log('🧪 [DB_TEST] Supabase URL:', supabaseUrl);
      console.log('🧪 [DB_TEST] Anon Key (first 50 chars):', supabaseKey?.substring(0, 50) + '...');
      
      console.log('🧪 [DB_TEST] Step 2: Testing auth session');
      
      const sessionPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), 3000)
      )
      
      try {
        const { data: sessionData } = await Promise.race([sessionPromise, timeoutPromise]) as any
        console.log('✅ [DB_TEST] Session check successful');
      } catch (dbError) {
        console.error('❌ [DB_TEST] Database diagnostics failed:', dbError);
        console.error('❌ [DB_TEST] Error message:', dbError instanceof Error ? dbError.message : 'Unknown error');
        console.error('❌ [DB_TEST] Error type:', typeof dbError);
        
        console.log('🔍 [DB_TEST] Environment check:');
        console.log('🔍 [DB_TEST] - EXPO_PUBLIC_SUPABASE_URL exists:', !!process.env.EXPO_PUBLIC_SUPABASE_URL);
        console.log('🔍 [DB_TEST] - EXPO_PUBLIC_SUPABASE_ANON_KEY exists:', !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
        console.log('🔍 [DB_TEST] - Network connectivity issue suspected');
        
        console.log('⚠️ [PROFILE] Database connectivity failed, using fallback profile');
        setProfile({
          id: 'fallback',
          name: 'Demo User',
          age: 25,
          location: 'Mumbai, India',
          interests: ['Technology', 'Events', 'Networking'],
          onboarded: true,
          profile_photos: []
        })
        setLoading(false)
        return
      }
      
      console.log('🔍 [PROFILE] Getting authenticated user...');
      const authStartTime = Date.now();
      
      // Get current user directly (no caching as per official docs)
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      const authEndTime = Date.now();
      console.log(`🔍 [PROFILE] Auth query completed in ${authEndTime - authStartTime}ms`);
      
      if (authError || !user) {
        console.error('❌ [PROFILE] Auth error:', authError);
        console.log('🔄 [PROFILE] Creating fallback profile...');
        setProfile({
          id: 'fallback',
          name: 'Demo User',
          age: 25,
          location: 'Mumbai, India',
          interests: ['Technology', 'Events', 'Networking'],
          onboarded: true,
          profile_photos: []
        })
        setLoading(false)
        return
      }
      
      setUser(user)

      if (user) {
        console.log('🔍 [PROFILE] Fetching profile data from both tables...');
        console.log('🔍 [PROFILE] Query 1: profiles table, user_id =', user.id);
        console.log('🔍 [PROFILE] Query 2: user_profiles table, user_id =', user.id);
        
        const profileQueryStartTime = Date.now();
        
        // Add timeout wrapper to prevent infinite hanging
        const profilePromise = Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('user_profiles').select('profile_photos, display_name, bio, interests').eq('user_id', user.id).single()
        ])
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile queries timeout after 8000ms')), 8000)
        )
        
        // Fetch both profiles table and user_profiles table for complete data
        const [{ data: profileData }, { data: userProfileData }] = await Promise.race([
          profilePromise,
          timeoutPromise
        ]) as any

        const profileQueryEndTime = Date.now();
        console.log(`🔍 [PROFILE] Profile queries completed in ${profileQueryEndTime - profileQueryStartTime}ms`);
        
        console.log('✅ [PROFILE] Profiles table result:', profileData);
        console.log('✅ [PROFILE] User_profiles table result:', userProfileData);

        if (profileData) {
          const combinedProfile = {
            ...profileData,
            profile_photos: userProfileData?.profile_photos || [],
            // Use display_name from user_profiles if available, fall back to name from profiles
            name: userProfileData?.display_name || profileData.name,
            interests: userProfileData?.interests || []
          };
          
          console.log('✅ [PROFILE] Combined profile data:', combinedProfile);
          setProfile(combinedProfile)
          console.log('✅ [PROFILE] Successfully loaded user profile from database');
        } else {
          console.log('⚠️ [PROFILE] No profile found in profiles table');
          console.log('🔄 [PROFILE] User may need to complete onboarding');
        }
      }
    } catch (error) {
      console.error('💥 [PROFILE] Unexpected error:', error);
      console.error('💥 [PROFILE] Error type:', typeof error);
      console.error('💥 [PROFILE] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.log('🔄 [PROFILE] Creating fallback profile...');
      
      // Fallback with basic user info if available
      if (user) {
        const fallbackProfile = {
          id: user.id,
          name: user.user_metadata?.full_name || user.email || 'User',
          age: 25,
          location: 'Unknown',
          interests: [],
          onboarded: true,
          profile_photos: []
        };
        
        console.log('🔄 [PROFILE] Fallback profile:', fallbackProfile);
        setProfile(fallbackProfile);
        console.log('🔄 [PROFILE] Set fallback profile with basic user info');
      }
    } finally {
      console.log('🏁 [PROFILE] getUserAndProfile completed');
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // await GoogleSignin.signOut() // This line was removed as per the edit hint
              const { error } = await supabase.auth.signOut()
              if (error) {
                console.error('Sign out error:', error)
                Alert.alert('Error', 'Failed to sign out')
              }
            } catch (error) {
              console.error('Google sign out error:', error)
            }
          }
        }
      ]
    )
  }

  const testDatabaseConnection = async () => {
    console.log('�� [DB_TEST] Starting comprehensive database diagnostics...');
    
    try {
      // Test 1: Check if Supabase URL is reachable
      console.log('🧪 [DB_TEST] Step 1: Testing Supabase URL reachability');
      console.log('🧪 [DB_TEST] Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
      console.log('🧪 [DB_TEST] Anon Key (first 50 chars):', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 50) + '...');
      
      // Test 2: Simple auth status check
      console.log('🧪 [DB_TEST] Step 2: Testing auth session');
      const { data: sessionData, error: sessionError } = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), 3000))
      ]) as any
      
      if (sessionError) {
        console.error('❌ [DB_TEST] Session check failed:', sessionError);
      } else {
        console.log('✅ [DB_TEST] Session check successful:', sessionData?.session?.user?.id || 'No session');
      }
      
      // Test 3: Simple REST API call
      console.log('🧪 [DB_TEST] Step 3: Testing basic REST API');
      const restPromise = fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: {
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json'
        }
      })
      
      const restTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('REST API timeout after 5000ms')), 5000)
      )
      
      try {
        const restResponse = await Promise.race([restPromise, restTimeout]) as any
        console.log('✅ [DB_TEST] REST API responded:', restResponse.status);
      } catch (restError) {
        console.error('❌ [DB_TEST] REST API failed:', restError);
      }
      
      // Test 4: Simple table query
      console.log('🧪 [DB_TEST] Step 4: Testing simple table query');
      const queryPromise = supabase
        .from('profiles')
        .select('count')
        .limit(1)
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database test timeout after 5000ms')), 5000)
      )
      
      const startTime = Date.now()
      const result = await Promise.race([queryPromise, timeoutPromise]) as any
      const endTime = Date.now()
      
      console.log(`✅ [DB_TEST] Database connection successful! (${endTime - startTime}ms)`);
      console.log('✅ [DB_TEST] Test result:', result);
      return true
    } catch (error) {
      console.error('❌ [DB_TEST] Database diagnostics failed:', error);
      console.error('❌ [DB_TEST] Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ [DB_TEST] Error type:', typeof error);
      
      // Additional diagnostics
      console.log('🔍 [DB_TEST] Environment check:');
      console.log('🔍 [DB_TEST] - EXPO_PUBLIC_SUPABASE_URL exists:', !!process.env.EXPO_PUBLIC_SUPABASE_URL);
      console.log('🔍 [DB_TEST] - EXPO_PUBLIC_SUPABASE_ANON_KEY exists:', !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
      console.log('🔍 [DB_TEST] - Network connectivity issue suspected');
      
      return false
    }
  }

  const handleEditProfile = () => {
    // router.push('/edit-profile' as any) // This line was removed as per the edit hint
  }

  const renderAvatar = () => {
    const hasPhotos = profile?.profile_photos && profile.profile_photos.length > 0
    const photoUrl = hasPhotos ? profile.profile_photos![0] : null
    const initials = (profile?.name || user?.user_metadata?.full_name || user?.email || 'U')[0].toUpperCase()

    return (
      <View style={styles.avatarContainer}>
        {photoUrl ? (
          <Image 
            source={{ uri: photoUrl }} 
            style={styles.avatar}
            onError={(error) => {
              console.log('Profile photo failed to load:', photoUrl)
              console.log('Error details:', error.nativeEvent)
            }}
            onLoad={() => {
              console.log('Profile photo loaded successfully:', photoUrl)
            }}
            // Add cache control for better loading
            defaultSource={require('../../assets/images/icon.png')}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile... ✨</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🧪 Debug Info</Text>
          <Text style={styles.infoText}>
            <Text style={styles.boldText}>Auth Status:</Text> {user ? '✅ Logged In' : '❌ Not Logged In'}
            {'\n'}<Text style={styles.boldText}>User ID:</Text> {user?.id || 'None'}
            {'\n'}<Text style={styles.boldText}>Email:</Text> {user?.email || 'None'}
          </Text>
          
          <View style={styles.debugButtons}>
            <TouchableOpacity 
              style={styles.testButton}
              onPress={async () => {
                console.log('🧪 [MANUAL_TEST] User initiated database diagnostics');
                const isWorking = await testDatabaseConnection()
                Alert.alert(
                  'Database Test Results',
                  isWorking 
                    ? 'Database connection is working!' 
                    : 'Database connection failed. Check console logs for details.',
                  [{ text: 'OK' }]
                )
              }}
            >
              <Text style={styles.testButtonText}>🧪 Test Database Connection</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.testButton}
              onPress={async () => {
                console.log('🌐 [NETWORK_DIAGNOSIS] Starting detailed network analysis');
                
                const results: string[] = [];
                let currentStep = 'Unknown';
                
                try {
                  // Step 1: Basic Internet via HTTP
                  currentStep = 'Basic Internet (HTTP)';
                  console.log(`🌐 [NETWORK_DIAGNOSIS] Testing: ${currentStep}`);
                  const httpTest = await Promise.race([
                    fetch('http://httpbin.org/ip'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP timeout')), 3000))
                  ]) as any;
                  results.push(`✅ ${currentStep}: ${httpTest.status}`);
                  console.log(`✅ [NETWORK_DIAGNOSIS] ${currentStep} works`);
                  
                  // Step 2: HTTPS Internet
                  currentStep = 'HTTPS Internet';
                  console.log(`🌐 [NETWORK_DIAGNOSIS] Testing: ${currentStep}`);
                  const httpsTest = await Promise.race([
                    fetch('https://httpbin.org/ip'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('HTTPS timeout')), 3000))
                  ]) as any;
                  results.push(`✅ ${currentStep}: ${httpsTest.status}`);
                  console.log(`✅ [NETWORK_DIAGNOSIS] ${currentStep} works`);
                  
                  // Step 3: Supabase Domain Resolution
                  currentStep = 'Supabase Domain';
                  console.log(`🌐 [NETWORK_DIAGNOSIS] Testing: ${currentStep}`);
                  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
                  const domainTest = await Promise.race([
                    fetch(supabaseUrl, { method: 'HEAD' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Domain timeout')), 5000))
                  ]) as any;
                  results.push(`✅ ${currentStep}: ${domainTest.status}`);
                  console.log(`✅ [NETWORK_DIAGNOSIS] ${currentStep} works`);
                  
                  // Step 4: Supabase REST API
                  currentStep = 'Supabase REST API';
                  console.log(`🌐 [NETWORK_DIAGNOSIS] Testing: ${currentStep}`);
                  const restTest = await Promise.race([
                    fetch(`${supabaseUrl}/rest/v1/`, {
                      method: 'GET',
                      headers: {
                        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
                        'Content-Type': 'application/json'
                      }
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('REST API timeout')), 5000))
                  ]) as any;
                  results.push(`✅ ${currentStep}: ${restTest.status}`);
                  console.log(`✅ [NETWORK_DIAGNOSIS] ${currentStep} works`);
                  
                  // Step 5: Supabase Auth Check
                  currentStep = 'Supabase Auth';
                  console.log(`🌐 [NETWORK_DIAGNOSIS] Testing: ${currentStep}`);
                  const authTest = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000))
                  ]) as any;
                  results.push(`✅ ${currentStep}: Session found`);
                  console.log(`✅ [NETWORK_DIAGNOSIS] ${currentStep} works`);
                  
                  // Step 6: Simple Database Query
                  currentStep = 'Database Query';
                  console.log(`🌐 [NETWORK_DIAGNOSIS] Testing: ${currentStep}`);
                  const dbTest = await Promise.race([
                    supabase.from('profiles').select('count').limit(1),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout')), 5000))
                  ]) as any;
                  results.push(`✅ ${currentStep}: Query executed`);
                  console.log(`✅ [NETWORK_DIAGNOSIS] ${currentStep} works`);
                  
                  // All tests passed
                  const summary = results.join('\n');
                  console.log('🎉 [NETWORK_DIAGNOSIS] All tests passed!');
                  Alert.alert(
                    '🎉 Network Diagnosis: SUCCESS', 
                    `All connectivity layers work!\n\n${summary}\n\nYour database should work now. Try refreshing the app.`,
                    [{ text: 'OK', style: 'default' }]
                  );
                  
                } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                  console.error(`❌ [NETWORK_DIAGNOSIS] Failed at step: ${currentStep}`, error);
                  
                  const summary = results.length > 0 ? results.join('\n') + '\n\n' : '';
                  
                  // Provide specific troubleshooting based on where it failed
                  let diagnosis = '';
                  let solution = '';
                  
                  if (currentStep === 'Basic Internet (HTTP)') {
                    diagnosis = '❌ No internet connection';
                    solution = 'Check your WiFi/cellular connection and try again.';
                  } else if (currentStep === 'HTTPS Internet') {
                    diagnosis = '❌ HTTPS blocked';
                    solution = 'Your network blocks HTTPS. Try a different network or disable VPN.';
                  } else if (currentStep === 'Supabase Domain') {
                    diagnosis = '❌ Supabase servers unreachable';
                    solution = 'Supabase is blocked by firewall/VPN. Try different network or disable corporate VPN.';
                  } else if (currentStep === 'Supabase REST API') {
                    diagnosis = '❌ Supabase API blocked';
                    solution = 'API requests are being filtered. Check firewall settings or try mobile hotspot.';
                  } else if (currentStep === 'Supabase Auth') {
                    diagnosis = '❌ Auth service timeout';
                    solution = 'Auth is working but slow. Try restarting the app.';
                  } else if (currentStep === 'Database Query') {
                    diagnosis = '❌ Database access blocked';
                    solution = 'Database queries are blocked. This is the main issue - try mobile hotspot.';
                  }
                  
                  Alert.alert(
                    '🚨 Network Diagnosis: FAILED',
                    `${summary}❌ Failed at: ${currentStep}\n\n${diagnosis}\n\n💡 Solution: ${solution}`,
                    [{ text: 'OK', style: 'destructive' }]
                  );
                }
              }}
            >
              <Text style={styles.testButtonText}>🔬 Network Diagnosis</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.testButton}
              onPress={async () => {
                console.log('🏗️ [SUPABASE_TEST] Testing Supabase URL reachability');
                try {
                  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
                  console.log('🏗️ [SUPABASE_TEST] Testing URL:', supabaseUrl);
                  
                  const response = await Promise.race([
                    fetch(supabaseUrl + '/rest/v1/', {
                      method: 'HEAD',
                      headers: {
                        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
                      }
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase URL timeout')), 5000))
                  ]) as any
                  
                  console.log('✅ [SUPABASE_TEST] Supabase URL reachable:', response.status);
                  Alert.alert('Supabase Test', `Supabase URL is reachable! Status: ${response.status}`)
                } catch (error) {
                  console.error('❌ [SUPABASE_TEST] Supabase URL unreachable:', error);
                  Alert.alert('Supabase Test', 'Supabase URL is not reachable. This might be a network or VPN issue.')
                }
              }}
            >
              <Text style={styles.testButtonText}>🏗️ Test Supabase URL</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.testButton}
              onPress={async () => {
                console.log('🛡️ [VPN_CHECK] Testing for VPN/Firewall interference');
                
                try {
                  // Test multiple external services to detect filtering
                  const tests = [
                    { name: 'Google DNS', url: 'https://dns.google/resolve?name=google.com' },
                    { name: 'Cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace' },
                    { name: 'GitHub API', url: 'https://api.github.com' },
                    { name: 'Supabase Direct', url: process.env.EXPO_PUBLIC_SUPABASE_URL + '/rest/v1/' }
                  ];
                  
                  const results: string[] = [];
                  let blockedCount = 0;
                  
                  for (const test of tests) {
                    try {
                      console.log(`🛡️ [VPN_CHECK] Testing ${test.name}...`);
                      const response = await Promise.race([
                        fetch(test.url, { method: 'HEAD' }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                      ]) as any;
                      
                      results.push(`✅ ${test.name}: ${response.status}`);
                      console.log(`✅ [VPN_CHECK] ${test.name} accessible`);
                    } catch (error) {
                      results.push(`❌ ${test.name}: Blocked/Timeout`);
                      blockedCount++;
                      console.log(`❌ [VPN_CHECK] ${test.name} blocked`);
                    }
                  }
                  
                  const summary = results.join('\n');
                  
                  if (blockedCount === 0) {
                    Alert.alert(
                      '✅ VPN/Firewall Check: OK',
                      `All external services accessible!\n\n${summary}\n\nThe issue might be specific to Supabase or iOS simulator.`,
                      [{ text: 'OK' }]
                    );
                  } else if (blockedCount >= 3) {
                    Alert.alert(
                      '🚨 VPN/Firewall Detected',
                      `${blockedCount}/4 services blocked!\n\n${summary}\n\n🔧 Solutions:\n• Disable VPN/Proxy\n• Try mobile hotspot\n• Use different WiFi\n• Check corporate firewall`,
                      [{ text: 'OK', style: 'destructive' }]
                    );
                  } else {
                    Alert.alert(
                      '⚠️ Partial Network Issues',
                      `${blockedCount}/4 services blocked\n\n${summary}\n\n💡 This suggests selective filtering. Try disabling VPN or switching networks.`,
                      [{ text: 'OK' }]
                    );
                  }
                  
                } catch (error) {
                  console.error('❌ [VPN_CHECK] Test failed:', error);
                  Alert.alert('VPN Check Failed', 'Unable to run VPN/Firewall detection test.');
                }
              }}
            >
              <Text style={styles.testButtonText}>🛡️ VPN/Firewall Check</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.testButton}
              onPress={() => {
                console.log('📊 [ENV_INFO] Showing environment information');
                
                const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'Not set';
                const hasKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing';
                
                Alert.alert(
                  '📊 Environment Info', 
                  `Supabase URL:\n${supabaseUrl}\n\nAPI Key: ${hasKey}\n\nIf URL shows "rycftadewrklmsswzviy.supabase.co" and key is "Set", then environment is correct.`,
                  [{ text: 'OK' }]
                );
              }}
            >
              <Text style={styles.testButtonText}>📊 Environment Info</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.testButton}
              onPress={() => {
                Alert.alert(
                  '🔧 Troubleshooting Guide',
                  `Since Supabase MCP ✅ works but iOS Simulator ❌ fails:\n\n🎯 LIKELY CAUSES:\n• iOS Simulator network restrictions\n• VPN blocking Supabase specifically\n• Firewall filtering database connections\n• Corporate network blocking PostgreSQL ports\n\n🛠️ SOLUTIONS TO TRY:\n1. Switch to mobile hotspot\n2. Disable VPN/Proxy completely\n3. Try on physical device\n4. Use different WiFi network\n5. Restart iOS Simulator\n6. Reset Network Settings\n\n📱 The fact that auth works but queries fail suggests Supabase auth servers are accessible but database servers are blocked.`,
                  [{ text: 'OK' }]
                );
              }}
            >
              <Text style={styles.testButtonText}>🔧 Troubleshooting Guide</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.testButton}
              onPress={() => {
                Alert.alert(
                  '🚨 iOS Simulator Network Issue',
                  `Network diagnosis failed at BASIC INTERNET step!\n\n🎯 THIS MEANS:\n• iOS Simulator has NO internet at all\n• Not a Supabase-specific issue\n• Simulator network stack is broken\n\n🔧 IMMEDIATE FIXES:\n\n1️⃣ RESET SIMULATOR:\n• Device → Erase All Content and Settings\n• Restart iOS Simulator completely\n\n2️⃣ CHECK HOST NETWORK:\n• Test internet on Mac (not simulator)\n• Disable/enable WiFi on Mac\n• Try different WiFi network\n\n3️⃣ SIMULATOR SETTINGS:\n• Simulator → Device → Network Link Conditioner OFF\n• Check if proxy/VPN affecting simulator\n\n4️⃣ NUCLEAR OPTION:\n• Quit iOS Simulator completely\n• Restart Mac if necessary\n• Use different Xcode simulator version`,
                  [
                    { text: 'Reset Simulator', style: 'destructive' },
                    { text: 'OK', style: 'default' }
                  ]
                );
              }}
            >
              <Text style={styles.testButtonText}>🚨 Fix Simulator Network</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.logoutButton}
              onPress={handleSignOut}
            >
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>👤 My Profile</Text>
          <Text style={styles.infoText}>Manage your dating profile</Text>
        </View>

        {user && (
          <View style={styles.profileCard}>
            {renderAvatar()}

            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {profile?.name || user.user_metadata?.full_name || 'New User'}
              </Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              {profile?.profile_photos && profile.profile_photos.length > 0 && (
                <Text style={styles.photoCount}>
                  {profile.profile_photos.length} photo{profile.profile_photos.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>

            <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {profile && (
          <View style={styles.detailsCard}>
            <Text style={styles.cardTitle}>Profile Details</Text>
            
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Age</Text>
              <Text style={styles.detailValue}>{profile.age || 'Not set'}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>{profile.location || 'Not set'}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Interests</Text>
              <Text style={styles.detailValue}>
                {profile.interests && profile.interests.length > 0 
                  ? profile.interests.join(', ') 
                  : 'Not set'
                }
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Photos</Text>
              <Text style={styles.detailValue}>
                {profile.profile_photos && profile.profile_photos.length > 0 
                  ? `${profile.profile_photos.length} uploaded`
                  : 'None uploaded'
                }
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Profile Status</Text>
              <Text style={[
                styles.detailValue,
                { color: profile.onboarded ? '#4CAF50' : '#FF9800' }
              ]}>
                {profile.onboarded ? '✅ Complete' : '⏳ Incomplete'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.actionsCard}>
          <Text style={styles.cardTitle}>Account</Text>
          
          <TouchableOpacity style={styles.actionItem} onPress={handleEditProfile}>
            <Text style={styles.actionIcon}>✏️</Text>
            <Text style={styles.actionText}>Edit Profile</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionItem} 
            onPress={() => {/* router.push('/blocked-users' as any) */}}
          >
            <Text style={styles.actionIcon}>🛡️</Text>
            <Text style={styles.actionText}>Blocked Users</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionItem, { backgroundColor: '#f0f8ff' }]} 
            onPress={() => {/* router.push('/test-features' as any) */}}
          >
            <Text style={styles.actionIcon}>🧪</Text>
            <Text style={[styles.actionText, { color: '#FF6B6B' }]}>Test Features</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => Alert.alert('Coming Soon!', 'Settings feature will be available soon!')}>
            <Text style={styles.actionIcon}>⚙️</Text>
            <Text style={styles.actionText}>Settings</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => Alert.alert('Coming Soon!', 'Help & Support feature will be available soon!')}>
            <Text style={styles.actionIcon}>❓</Text>
            <Text style={styles.actionText}>Help & Support</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionItem, styles.signOutItem]} onPress={handleSignOut}>
            <Text style={styles.actionIcon}>🚪</Text>
            <Text style={[styles.actionText, styles.signOutText]}>Sign Out</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    marginBottom: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  photoCount: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  actionArrow: {
    fontSize: 20,
    color: '#ccc',
  },
  signOutItem: {
    borderBottomWidth: 0,
  },
  signOutText: {
    color: '#ff3b30',
  },
  avatarPlaceholder: {
    backgroundColor: '#FF6B6B',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  debugButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  testButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
}) 