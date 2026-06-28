cmake_minimum_required(VERSION 3.5)

if(NOT DEFINED CMAKE_TOOLCHAIN_FILE)
  if(DEFINED ENV{VITASDK})
    set(CMAKE_TOOLCHAIN_FILE "$ENV{VITASDK}/share/vita.toolchain.cmake" CACHE PATH "toolchain file")
  else()
    message(FATAL_ERROR "Please define VITASDK to point to your SDK path!")
  endif()
endif()

project(sorcery_vita_launcher)
include("${VITASDK}/share/vita.cmake" REQUIRED)

set(VITA_APP_NAME "Sorcery Native")
set(VITA_TITLEID "SORC00001")
set(VITA_VERSION "01.00")

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra -std=gnu11")
set(VITA_MKSFOEX_FLAGS "${VITA_MKSFOEX_FLAGS} -d PARENTAL_LEVEL=1")

add_executable(${PROJECT_NAME}
  src/card_db.c
  src/game_core.c
  src/input.c
  src/main.c
  src/render.c
  src/save_state.c
)

target_link_libraries(${PROJECT_NAME}
  vita2d
  SceAppMgr_stub
  SceCommonDialog_stub
  SceCtrl_stub
  SceDisplay_stub
  SceGxm_stub
  SceIofilemgr_stub
  SceKernelDmacMgr_stub
  SceLibKernel_stub
  ScePgf_stub
  ScePvf_stub
  SceSysmodule_stub
  freetype
  jpeg
  png
  z
  m
)

file(GLOB VITA_CARD_ART_FILES "${CMAKE_CURRENT_SOURCE_DIR}/data/art/*.png")
set(VITA_VPK_DATA_FILES
  FILE data/cards.csv data/cards.csv
  FILE data/decks.csv data/decks.csv
  FILE data/generation-report.txt data/generation-report.txt
  FILE data/card-art.csv data/card-art.csv
  FILE data/art-report.txt data/art-report.txt
)
foreach(ART_FILE ${VITA_CARD_ART_FILES})
  get_filename_component(ART_NAME "${ART_FILE}" NAME)
  list(APPEND VITA_VPK_DATA_FILES FILE "${ART_FILE}" "data/art/${ART_NAME}")
endforeach()

vita_create_self(${PROJECT_NAME}.self ${PROJECT_NAME} UNSAFE)
vita_create_vpk(${PROJECT_NAME}.vpk ${VITA_TITLEID} ${PROJECT_NAME}.self
  VERSION ${VITA_VERSION}
  NAME ${VITA_APP_NAME}
  FILE sce_sys/icon0.png sce_sys/icon0.png
  ${VITA_VPK_DATA_FILES}
  FILE sce_sys/livearea/contents/bg.png sce_sys/livearea/contents/bg.png
  FILE sce_sys/livearea/contents/startup.png sce_sys/livearea/contents/startup.png
  FILE sce_sys/livearea/contents/template.xml sce_sys/livearea/contents/template.xml
)
