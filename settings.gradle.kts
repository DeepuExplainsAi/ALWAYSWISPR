// Wispr by Deepu Gupta. Copyright (c) 2026 Deepu Gupta. All rights reserved.
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "WisprByDeepuGupta"
include(":app")
