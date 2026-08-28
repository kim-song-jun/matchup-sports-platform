plugins { id("com.android.application") }

android {
    namespace = "kr.co.teameet"
    compileSdk = 36
    defaultConfig {
        applicationId = "kr.co.teameet"
        minSdk = 26
        targetSdk = 36
        versionCode = providers.gradleProperty("versionCode").orElse("1").get().toInt()
        versionName = providers.gradleProperty("versionName").orElse("0.1.0").get()
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
            buildConfigField("String", "WEB_ORIGIN", javaStringQuote + "https://teameet.co.kr" + javaStringQuote)
            buildConfigField("String", "FIREBASE_PROJECT_ID", javaStringQuote + providers.gradleProperty("firebaseProjectIdProduction").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_APP_ID", javaStringQuote + providers.gradleProperty("firebaseAppIdProduction").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_API_KEY", javaStringQuote + providers.gradleProperty("firebaseApiKeyProduction").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_SENDER_ID", javaStringQuote + providers.gradleProperty("firebaseSenderIdProduction").orElse("").get() + javaStringQuote)
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
