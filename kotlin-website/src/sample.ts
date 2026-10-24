export const sample = `package playground

/** A little Kotlin, a little color. */
data class Developer(
    val name: String,
    val languages: List<String> = listOf("Kotlin")
) {
    fun greeting(): String = "Hello, $name!"
}

sealed interface Result<out T> {
    data class Success<T>(val value: T) : Result<T>
    data class Failure(val message: String) : Result<Nothing>
}

suspend fun explore(developer: Developer): Result<String> {
    val favorites = developer.languages
        .filter { it.isNotBlank() }
        .joinToString(separator = " · ")

    return when {
        favorites.isEmpty() -> Result.Failure("Pick a language")
        else -> Result.Success("\${developer.greeting()} $favorites")
    }
}

annotation class Preview
typealias Name = String
enum class Language { KOTLIN, JAVA }

@Preview
abstract class Workspace<T>(val title: Name) {
    abstract fun render(value: T): String
}

fun count(limit: Int): Int {
    val step = 2
    var total = 0
    scan@ for (index in 0..limit) {
        if (index > 10) break@scan
        total += step
    }
    return total
}
`;
