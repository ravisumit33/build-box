cmake_minimum_required(VERSION 3.20)

project(connect_four LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_executable(connect_four
    src/board.cpp
    src/game.cpp
    src/game_session.cpp
    src/player.cpp
    src/web_bindings.cpp
)

target_include_directories(connect_four PRIVATE include)
target_compile_features(connect_four PRIVATE cxx_std_23)

target_link_options(connect_four PRIVATE
    --bind
    --no-entry
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=createConnectFour
    -sENVIRONMENT=web
    -sALLOW_MEMORY_GROWTH=1
)
set_target_properties(connect_four PROPERTIES
    OUTPUT_NAME connect_four
    SUFFIX ".js"
    CXX_EXTENSIONS OFF
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/generated"
)
