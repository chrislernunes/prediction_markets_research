cmake_minimum_required(VERSION 3.22)

# Policy for older CMake compatibility in dependencies
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

project(polymarket_arb VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
option(ENABLE_LTO "Enable Link-Time Optimization (Release only)" ON)
option(ENABLE_NATIVE_ARCH "Tune for this CPU with -march=native. Binaries then only run on the build CPU family; keep OFF for Docker images and anything deployed elsewhere" OFF)
option(ENABLE_PGO_GENERATE "Build with PGO instrumentation (profile generation)" OFF)
option(ENABLE_PGO_USE "Build using PGO profile data" OFF)
option(ENABLE_ASAN "Enable AddressSanitizer (Debug/RelWithDebInfo)" OFF)
option(ENABLE_UBSAN "Enable UndefinedBehaviorSanitizer (Debug/RelWithDebInfo)" OFF)
option(POLY_ARB_BUILD_TESTS "Build poly-arb C++ unit tests" ON)
option(POLYARB_BUILD_EXECUTION_APPS "Build the credentialed execution experiments (apps/execution)" ON)
option(POLYARB_FETCH_UPDATES "Re-check the SDK git remote on every configure (needs network)" OFF)

# ---------------------------------------------------------------------------
# Compiler flags
# ---------------------------------------------------------------------------
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -DDEBUG")
set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "-O2 -g -DNDEBUG -fno-omit-frame-pointer")

if(ENABLE_NATIVE_ARCH)
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -march=native")
    set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "${CMAKE_CXX_FLAGS_RELWITHDEBINFO} -march=native")
    message(STATUS "Native CPU tuning enabled: do not ship these binaries to other hardware")
endif()

if(ENABLE_LTO AND CMAKE_BUILD_TYPE STREQUAL "Release")
    include(CheckIPOSupported)
    check_ipo_supported(RESULT lto_supported OUTPUT lto_error)
    if(lto_supported)
        set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ON)
        message(STATUS "LTO enabled for Release build")
    else()
        message(WARNING "LTO not supported: ${lto_error}")
    endif()
endif()

if(ENABLE_PGO_GENERATE)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fprofile-generate=${CMAKE_BINARY_DIR}/pgo-data")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fprofile-generate=${CMAKE_BINARY_DIR}/pgo-data")
    message(STATUS "PGO: Instrumentation enabled. Run workload, then rebuild with -DENABLE_PGO_USE=ON")
elseif(ENABLE_PGO_USE)
    if(EXISTS "${CMAKE_BINARY_DIR}/pgo-data")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fprofile-use=${CMAKE_BINARY_DIR}/pgo-data -fprofile-correction")
        set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fprofile-use=${CMAKE_BINARY_DIR}/pgo-data")
        message(STATUS "PGO: Using profile data from ${CMAKE_BINARY_DIR}/pgo-data")
    else()
        message(WARNING "PGO: Profile data not found at ${CMAKE_BINARY_DIR}/pgo-data. Run instrumented build first.")
    endif()
endif()

if(ENABLE_ASAN AND NOT CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address -fno-omit-frame-pointer")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fsanitize=address")
    message(STATUS "AddressSanitizer enabled")
endif()

if(ENABLE_UBSAN AND NOT CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=undefined")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fsanitize=undefined")
    message(STATUS "UndefinedBehaviorSanitizer enabled")
endif()

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
find_package(CURL REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(Threads REQUIRED)

if(NOT TARGET OpenSSL::SSL)
    add_library(OpenSSL::SSL UNKNOWN IMPORTED GLOBAL)
    set_target_properties(OpenSSL::SSL PROPERTIES
        IMPORTED_LOCATION "${OPENSSL_SSL_LIBRARY}"
        INTERFACE_INCLUDE_DIRECTORIES "${OPENSSL_INCLUDE_DIR}")
endif()

if(NOT TARGET OpenSSL::Crypto)
    add_library(OpenSSL::Crypto UNKNOWN IMPORTED GLOBAL)
    set_target_properties(OpenSSL::Crypto PROPERTIES
        IMPORTED_LOCATION "${OPENSSL_CRYPTO_LIBRARY}"
        INTERFACE_INCLUDE_DIRECTORIES "${OPENSSL_INCLUDE_DIR}")
endif()

include(FetchContent)

# The SDK is pinned to an immutable commit (the v3.0.0 release), not a movable tag.
# To test another ref: -DPOLYMARKET_CLIENT_GIT_TAG=<tag-or-commit>  (see scripts/update-cpp-client.sh)
set(POLYMARKET_CLIENT_GIT_TAG "fc48fbe7894be1e8fec048325043569196c3de72" CACHE STRING
    "Git ref for polymarket-cpp-client (default: commit of v3.0.0)")
if(NOT POLYARB_FETCH_UPDATES)
    set(FETCHCONTENT_UPDATES_DISCONNECTED ON CACHE BOOL "Do not re-check the SDK remote on configure" FORCE)
endif()
set(POLYMARKET_CLIENT_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(POLYMARKET_CLIENT_BUILD_TESTS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
    polymarket_client
    GIT_REPOSITORY https://github.com/SebastianBoehler/polymarket-cpp-client.git
    GIT_TAG ${POLYMARKET_CLIENT_GIT_TAG}
    GIT_PROGRESS TRUE
)
FetchContent_MakeAvailable(polymarket_client)

# ---------------------------------------------------------------------------
# Libraries (cpp/src, headers in cpp/include)
# ---------------------------------------------------------------------------
add_library(polyarb_market_stream src/market_stream.cpp)
target_include_directories(polyarb_market_stream PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(polyarb_market_stream PUBLIC polymarket::client)

add_library(polyarb_strategies
    src/discovery_options.cpp
    src/example_strategies.cpp
    src/slippage.cpp
)
target_include_directories(polyarb_strategies PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(polyarb_strategies PUBLIC polymarket::client)

# Header-only helpers (contracts.hpp) for apps that link only polymarket::client
add_library(polyarb_headers INTERFACE)
target_include_directories(polyarb_headers INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include)

# ---------------------------------------------------------------------------
# apps/research: public-data tools, never place orders
# ---------------------------------------------------------------------------
add_executable(discovery_mode apps/research/discovery_mode.cpp)
target_link_libraries(discovery_mode PRIVATE polyarb_strategies)

# ---------------------------------------------------------------------------
# apps/execution: credentialed experiments. Legacy CLOB V1 order construction.
# Not validated for live use; see docs/maintenance.md.
# ---------------------------------------------------------------------------
if(POLYARB_BUILD_EXECUTION_APPS)
    set(POLYARB_CLIENT_APPS polymarket_arb order_test clob_client_test batch_order_smoke position_smoke order_benchmark)
    foreach(app IN LISTS POLYARB_CLIENT_APPS)
        add_executable(${app} apps/execution/${app}.cpp)
        target_link_libraries(${app} PRIVATE polymarket::client polyarb_headers)
    endforeach()

    set(POLYARB_STREAM_APPS arb_test ladder_accumulation avg_in_test)
    foreach(app IN LISTS POLYARB_STREAM_APPS)
        add_executable(${app} apps/execution/${app}.cpp)
        target_link_libraries(${app} PRIVATE polyarb_market_stream polyarb_headers)
    endforeach()

    install(TARGETS polymarket_arb DESTINATION bin)
endif()

# ---------------------------------------------------------------------------
# Offline tests (the only targets registered with CTest)
# ---------------------------------------------------------------------------
if(POLY_ARB_BUILD_TESTS)
    enable_testing()

    add_executable(market_stream_test tests/market_stream_test.cpp)
    target_link_libraries(market_stream_test PRIVATE polyarb_market_stream)
    add_test(NAME market_stream_test COMMAND market_stream_test)

    add_executable(example_strategies_test tests/example_strategies_test.cpp)
    target_link_libraries(example_strategies_test PRIVATE polyarb_strategies)
    add_test(NAME example_strategies_test COMMAND example_strategies_test)

    add_executable(contracts_test tests/contracts_test.cpp)
    target_link_libraries(contracts_test PRIVATE polyarb_headers)
    add_test(NAME contracts_test COMMAND contracts_test)
endif()
