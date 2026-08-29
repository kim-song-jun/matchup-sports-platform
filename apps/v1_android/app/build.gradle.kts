import java.util.Properties

plugins { id("com.android.application") }

val releaseVersion = Properties().apply {
    rootProject.file("version.properties").inputStream().use { load(it) }
}
val teameetVersionCode = releaseVersion.getProperty("versionCode")?.toIntOrNull()
    ?: throw GradleException("version.properties must contain a positive integer versionCode")
val teameetVersionName = releaseVersion.getProperty("versionName").orEmpty()
require(teameetVersionCode > 0) { "versionCode must be positive" }
require(Regex("[0-9]+\\.[0-9]+\\.[0-9]+").matches(teameetVersionName)) {
    "versionName must use MAJOR.MINOR.PATCH"
}

val releaseSigningValues = mapOf(
    "ANDROID_RELEASE_KEYSTORE_PATH" to providers.environmentVariable("ANDROID_RELEASE_KEYSTORE_PATH").orNull,
    "ANDROID_RELEASE_KEYSTORE_PASSWORD" to providers.environmentVariable("ANDROID_RELEASE_KEYSTORE_PASSWORD").orNull,
    "ANDROID_RELEASE_KEY_ALIAS" to providers.environmentVariable("ANDROID_RELEASE_KEY_ALIAS").orNull,
    "ANDROID_RELEASE_KEY_PASSWORD" to providers.environmentVariable("ANDROID_RELEASE_KEY_PASSWORD").orNull,
)
val hasCompleteReleaseSigning = releaseSigningValues.values.all { !it.isNullOrBlank() }

android {
    namespace = "kr.co.teameet"
    compileSdk = 36
    defaultConfig {
        applicationId = "kr.co.teameet"
        minSdk = 26
        targetSdk = 36
        versionCode = teameetVersionCode
        versionName = teameetVersionName
    }
    flavorDimensions += "environment"
    val javaStringQuote = 34.toChar().toString()
    productFlavors {
        create("alpha") {
            dimension = "environment"
            applicationIdSuffix = ".alpha"
            versionNameSuffix = "-alpha"
            resValue("string", "app_name", "Teameet Alpha")
            manifestPlaceholders["appHost"] = "alpha.teameet.co.kr"
            manifestPlaceholders["appLinksAutoVerify"] = "false"
            buildConfigField("boolean", "WEBVIEW_DEBUGGING_ENABLED", "true")
            buildConfigField("String", "WEB_ORIGIN", javaStringQuote + "https://alpha.teameet.co.kr" + javaStringQuote)
            buildConfigField("String", "FIREBASE_PROJECT_ID", javaStringQuote + providers.gradleProperty("firebaseProjectIdAlpha").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_APP_ID", javaStringQuote + providers.gradleProperty("firebaseAppIdAlpha").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_API_KEY", javaStringQuote + providers.gradleProperty("firebaseApiKeyAlpha").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_SENDER_ID", javaStringQuote + providers.gradleProperty("firebaseSenderIdAlpha").orElse("").get() + javaStringQuote)
        }
        create("production") {
            dimension = "environment"
            resValue("string", "app_name", "Teameet")
            manifestPlaceholders["appHost"] = "teameet.co.kr"
            manifestPlaceholders["appLinksAutoVerify"] = "true"
            buildConfigField("boolean", "WEBVIEW_DEBUGGING_ENABLED", "false")
            buildConfigField("String", "WEB_ORIGIN", javaStringQuote + "https://teameet.co.kr" + javaStringQuote)
            buildConfigField("String", "FIREBASE_PROJECT_ID", javaStringQuote + providers.gradleProperty("firebaseProjectIdProduction").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_APP_ID", javaStringQuote + providers.gradleProperty("firebaseAppIdProduction").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_API_KEY", javaStringQuote + providers.gradleProperty("firebaseApiKeyProduction").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_SENDER_ID", javaStringQuote + providers.gradleProperty("firebaseSenderIdProduction").orElse("").get() + javaStringQuote)
        }
    }
    signingConfigs {
        create("release") {
            if (hasCompleteReleaseSigning) {
                storeFile = file(releaseSigningValues.getValue("ANDROID_RELEASE_KEYSTORE_PATH")!!)
                storePassword = releaseSigningValues.getValue("ANDROID_RELEASE_KEYSTORE_PASSWORD")
                keyAlias = releaseSigningValues.getValue("ANDROID_RELEASE_KEY_ALIAS")
                keyPassword = releaseSigningValues.getValue("ANDROID_RELEASE_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasCompleteReleaseSigning) signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures {
        buildConfig = true
        resValues = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.activity:activity:1.12.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.core:core:1.17.0")
    implementation("androidx.webkit:webkit:1.15.0")
    testImplementation("junit:junit:4.13.2")
}

tasks.register("verifyAlphaFirebaseConfiguration") {
    group = "verification"
    description = "Fails when the Alpha Firebase public app configuration is missing or internally inconsistent."
    doLast {
        val projectId = providers.gradleProperty("firebaseProjectIdAlpha").orNull.orEmpty()
        val appId = providers.gradleProperty("firebaseAppIdAlpha").orNull.orEmpty()
        val apiKey = providers.gradleProperty("firebaseApiKeyAlpha").orNull.orEmpty()
        val senderId = providers.gradleProperty("firebaseSenderIdAlpha").orNull.orEmpty()
        val missing = mapOf(
            "firebaseProjectIdAlpha" to projectId,
            "firebaseAppIdAlpha" to appId,
            "firebaseApiKeyAlpha" to apiKey,
            "firebaseSenderIdAlpha" to senderId,
        ).filterValues { it.isBlank() }.keys
        if (missing.isNotEmpty()) {
            throw GradleException("Missing Alpha Firebase configuration: ${missing.joinToString()}")
        }
        require(Regex("[a-z][a-z0-9-]{4,29}").matches(projectId)) {
            "firebaseProjectIdAlpha is not a valid Firebase project id"
        }
        require(Regex("(^|-)alpha($|-)").containsMatchIn(projectId)) {
            "firebaseProjectIdAlpha must identify the dedicated Alpha Firebase project"
        }
        require(Regex("1:[0-9]+:android:[0-9a-f]+").matches(appId)) {
            "firebaseAppIdAlpha is not an Android Firebase app id"
        }
        require(Regex("AIza[0-9A-Za-z_-]{35}").matches(apiKey)) {
            "firebaseApiKeyAlpha has an unexpected format"
        }
        require(Regex("[0-9]+").matches(senderId) && appId.startsWith("1:${senderId}:android:")) {
            "firebaseSenderIdAlpha does not match firebaseAppIdAlpha"
        }
        val productionProjectId = providers.gradleProperty("firebaseProjectIdProduction").orNull
        require(productionProjectId.isNullOrBlank() || productionProjectId != projectId) {
            "Alpha and production must not use the same Firebase project"
        }
    }
}

tasks.register("verifyProductionFirebaseConfiguration") {
    group = "verification"
    description = "Fails unless the production Firebase public app configuration is complete and isolated."
    doLast {
        val projectId = providers.gradleProperty("firebaseProjectIdProduction").orNull.orEmpty()
        val appId = providers.gradleProperty("firebaseAppIdProduction").orNull.orEmpty()
        val apiKey = providers.gradleProperty("firebaseApiKeyProduction").orNull.orEmpty()
        val senderId = providers.gradleProperty("firebaseSenderIdProduction").orNull.orEmpty()
        val missing = mapOf(
            "firebaseProjectIdProduction" to projectId,
            "firebaseAppIdProduction" to appId,
            "firebaseApiKeyProduction" to apiKey,
            "firebaseSenderIdProduction" to senderId,
        ).filterValues { it.isBlank() }.keys
        if (missing.isNotEmpty()) {
            throw GradleException("Missing production Firebase configuration: ${missing.joinToString()}")
        }
        require(Regex("[a-z][a-z0-9-]{4,29}").matches(projectId)) {
            "firebaseProjectIdProduction is not a valid Firebase project id"
        }
        require(!Regex("(^|-)alpha($|-)").containsMatchIn(projectId)) {
            "firebaseProjectIdProduction must not identify an Alpha Firebase project"
        }
        require(Regex("1:[0-9]+:android:[0-9a-f]+").matches(appId)) {
            "firebaseAppIdProduction is not an Android Firebase app id"
        }
        require(Regex("AIza[0-9A-Za-z_-]{35}").matches(apiKey)) {
            "firebaseApiKeyProduction has an unexpected format"
        }
        require(Regex("[0-9]+").matches(senderId) && appId.startsWith("1:${senderId}:android:")) {
            "firebaseSenderIdProduction does not match firebaseAppIdProduction"
        }
        val alphaProjectId = providers.gradleProperty("firebaseProjectIdAlpha").orNull
        require(alphaProjectId.isNullOrBlank() || alphaProjectId != projectId) {
            "Production and Alpha must not use the same Firebase project"
        }
    }
}

val verifyProductionReleaseReadiness = tasks.register("verifyProductionReleaseReadiness") {
    group = "verification"
    description = "Fails unless a production release has complete external signing configuration."
    doLast {
        val missing = releaseSigningValues.filterValues { it.isNullOrBlank() }.keys
        if (missing.isNotEmpty()) {
            throw GradleException("Missing production release signing configuration: ${missing.joinToString()}")
        }
        val keystore = file(releaseSigningValues.getValue("ANDROID_RELEASE_KEYSTORE_PATH")!!)
        require(keystore.isFile) { "ANDROID_RELEASE_KEYSTORE_PATH does not point to a file" }
    }
}

tasks.configureEach {
    if (name == "bundleProductionRelease" || name == "assembleProductionRelease") {
        dependsOn(verifyProductionReleaseReadiness)
        dependsOn("verifyProductionFirebaseConfiguration")
    }
}
