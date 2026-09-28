/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

/** Ownership marker. Kept inside the APK on purpose (see proguard-rules.pro). */
object Owner {
    @JvmField val NAME: String = "Deepu Gupta"
    @JvmField val APP: String = "Wispr by Deepu Gupta"
    @JvmField val NOTICE: String = "Wispr by Deepu Gupta. Copyright (c) 2026 Deepu Gupta. All rights reserved. " +
        "This app, its code, design and name are the property of Deepu Gupta. " +
        "Unauthorised copying, modification, re-branding or redistribution is prohibited."
}
