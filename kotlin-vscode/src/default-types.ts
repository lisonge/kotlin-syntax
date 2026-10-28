// Standard-library classifier names in Kotlin's default-import packages. Unknown names are never
// manufactured by attaching these package prefixes. This table does not expand platform type aliases.
const packages: Record<string, string> = {
  kotlin: `Annotation Any ArithmeticException Array AssertionError AutoCloseable Boolean BooleanArray
    BuilderInference Byte ByteArray Char CharArray CharSequence ClassCastException Comparable Comparator
    ConcurrentModificationException ConsistentCopyVisibility ContextFunctionTypeParams DeepRecursiveFunction
    DeepRecursiveScope Deprecated DeprecatedSinceKotlin DeprecationLevel Double DoubleArray DslMarker Enum
    EqualityBound Error Exception ExperimentalContextParameters ExperimentalMultiplatform ExperimentalStdlibApi
    ExperimentalSubclassOptIn ExperimentalUnsignedTypes ExperimentalVersionOverloading ExposedCopyVisibility
    ExtensionFunctionType Float FloatArray Function IgnorableReturnValue IllegalArgumentException IllegalStateException
    IndexOutOfBoundsException Int IntArray IntroducedAt KotlinVersion Lazy LazyThreadSafetyMode Long LongArray
    MustUseReturnValues NoSuchElementException NotImplementedError Nothing NullPointerException Number
    NumberFormatException OptIn OptionalExpectation OverloadResolutionByLambdaReturnType Pair ParameterName
    ReplaceWith RequiresOptIn Result RuntimeException Short ShortArray SinceKotlin String Suppress Throwable
    Throws Triple UByte UByteArray UInt UIntArray ULong ULongArray UShort UShortArray Unit UnsafeVariance UnsupportedOperationException`,
  'kotlin.annotation': 'AnnotationRetention AnnotationTarget MustBeDocumented Repeatable Retention Target',
  'kotlin.collections': `AbstractCollection AbstractIterator AbstractList AbstractMap AbstractMutableCollection
    AbstractMutableList AbstractMutableMap AbstractMutableSet AbstractSet ArrayDeque ArrayList BooleanIterator
    ByteIterator CharIterator Collection DoubleIterator FloatIterator Grouping HashMap HashSet IndexedValue
    IntIterator Iterable Iterator LinkedHashMap LinkedHashSet List ListIterator LongIterator Map MutableCollection
    MutableIterable MutableIterator MutableList MutableListIterator MutableMap MutableSet RandomAccess Set ShortIterator`,
  'kotlin.ranges': `CharProgression CharRange ClosedFloatingPointRange ClosedRange IntProgression IntRange
    LongProgression LongRange OpenEndRange UIntProgression UIntRange ULongProgression ULongRange`,
  'kotlin.sequences': 'Sequence SequenceScope',
  'kotlin.text': `Appendable CharCategory CharacterCodingException HexFormat MatchGroup MatchGroupCollection
    MatchNamedGroupCollection MatchResult Regex RegexOption StringBuilder Typography`,
};
export const defaultTypes = new Map(Object.entries(packages).flatMap(([pkg, names]) =>
  names.split(/\s+/).filter(Boolean).map(name => [name, [...pkg.split('.'), name]] as const)));
