cmake_minimum_required(VERSION 3.20)

project(connect_four LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_library(connect_four_core
    src/ai.cpp
    src/ai_controller.cpp
    src/board.cpp
    src/game.cpp
    src/game_session.cpp
    src/player.cpp
)

target_include_directories(connect_four_core PUBLIC include)
target_compile_features(connect_four_core PUBLIC cxx_std_23)
set_target_properties(connect_four_core PROPERTIES CXX_EXTENSIONS OFF)
find_package(Threads REQUIRED)
target_link_libraries(connect_four_core PUBLIC Threads::Threads)

if(EMSCRIPTEN)
  target_compile_options(connect_four_core PUBLIC -pthread -fexceptions)
  add_executable(connect_four src/web_bindings.cpp)
  target_link_libraries(connect_four PRIVATE connect_four_core)
  target_link_options(connect_four PRIVATE
        --bind
        --no-entry
        -pthread
        -fexceptions
        -sMODULARIZE=1
        -sEXPORT_ES6=1
        -sEXPORT_NAME=createConnectFour
        -sENVIRONMENT=web,worker
        -sPTHREAD_POOL_SIZE=1
        -sALLOW_BLOCKING_ON_MAIN_THREAD=0
        -sALLOW_MEMORY_GROWTH=1
  )
  set_target_properties(connect_four PROPERTIES
        OUTPUT_NAME connect_four
        SUFFIX ".js"
        CXX_EXTENSIONS OFF
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/generated"
  )
else()
  include(CTest)
  if(BUILD_TESTING)
    add_executable(connect_four_tests tests/engine_tests.cpp)
    target_link_libraries(connect_four_tests PRIVATE connect_four_core)
    add_test(NAME connect_four_engine COMMAND connect_four_tests)
    add_executable(connect_four_ai_tests tests/ai_tests.cpp)
    target_link_libraries(connect_four_ai_tests PRIVATE connect_four_core)
    add_test(NAME connect_four_ai COMMAND connect_four_ai_tests)
    add_executable(connect_four_thread_tests tests/thread_tests.cpp)
    target_link_libraries(connect_four_thread_tests PRIVATE connect_four_core)
    add_test(NAME connect_four_threads COMMAND connect_four_thread_tests)
    set_tests_properties(connect_four_engine connect_four_ai connect_four_threads
            PROPERTIES TIMEOUT 30)
  endif()
endif()
