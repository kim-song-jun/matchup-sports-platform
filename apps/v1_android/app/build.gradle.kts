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
            manifestPlaceholders["appHost"] = "alpha.teameet.co.kr"
            buildConfigField("String", "WEB_ORIGIN", javaStringQuote + "https://alpha.teameet.co.kr" + javaStringQuote)
            buildConfigField("String", "FIREBASE_PROJECT_ID", javaStringQuote + providers.gradleProperty("firebaseProjectIdAlpha").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_APP_ID", javaStringQuote + providers.gradleProperty("firebaseAppIdAlpha").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_API_KEY", javaStringQuote + providers.gradleProperty("firebaseApiKeyAlpha").orElse("").get() + javaStringQuote)
            buildConfigField("String", "FIREBASE_SENDER_ID", javaStringQuote + providers.gradleProperty("firebaseSenderIdAlpha").orElse("").get() + javaStringQuote)
        }
        create("production") {
            dimension = "environment"
            manifestPlaceholders["appHost"] = "teameet.co.kr"
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
    buildFeatures { buildConfig = true }
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
