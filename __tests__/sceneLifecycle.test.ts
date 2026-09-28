import plist from '@expo/plist'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The UIScene life cycle, in the files the binary is built from.
 *
 * An app linked against the iOS 27 SDK must adopt it: build 118 (Xcode 27)
 * stopped at launch on iOS 27.0 with EXC_BREAKPOINT in
 * `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. Expo SDK 57
 * ships `ExpoAppSceneDelegate`, which creates the window from the scene and
 * starts React Native into it; the app has to declare it and hand it the
 * factory.
 *
 * `ios/` is committed and EAS never runs prebuild, so app.json's
 * `ios.infoPlist` reaches the binary only through `ios/blendn/Info.plist` —
 * both are pinned, so neither can drift from the other.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
}

describe('iOS scene life cycle', () => {
  it('Info.plist declares one window scene, delegated to SceneDelegate', () => {
    const info = plist.parse(read('ios/blendn/Info.plist'))
    expect(info.UIApplicationSceneManifest).toEqual(SCENE_MANIFEST)
  })

  it('app.json declares the same manifest', () => {
    const { infoPlist } = JSON.parse(read('app.json')).expo.ios
    expect(infoPlist.UIApplicationSceneManifest).toEqual(SCENE_MANIFEST)
  })

  it('SceneDelegate subclasses ExpoAppSceneDelegate and is compiled into the app', () => {
    expect(read('ios/blendn/SceneDelegate.swift')).toMatch(/class SceneDelegate\s*:\s*ExpoAppSceneDelegate\b/)
    // Named in the plist but missing from Sources, UIKit finds no class and
    // the app launches to a black screen.
    expect(read('ios/blendn.xcodeproj/project.pbxproj')).toMatch(/SceneDelegate\.swift in Sources/)
  })

  it('AppDelegate hands the scene its React Native factory instead of opening a window', () => {
    const appDelegate = read('ios/blendn/AppDelegate.swift')
    // Without the conformance ExpoAppSceneDelegate calls fatalError at launch.
    expect(appDelegate).toMatch(/class AppDelegate\s*:\s*ExpoAppDelegate\s*,\s*ExpoReactNativeFactoryProvider\b/)
    // A second window and a second React Native start, if both did it.
    expect(appDelegate).not.toMatch(/startReactNative|UIWindow\(/)
  })
})
