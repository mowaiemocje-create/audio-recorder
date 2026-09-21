cmake_minimum_required(VERSION 3.22.1)
project("pitchrecnative")

add_library(pitchrecnative SHARED
    native-lib.cpp)

find_library(log-lib log)
find_library(aaudio-lib aaudio)

target_link_libraries(pitchrecnative
    ${log-lib}
    ${aaudio-lib})
