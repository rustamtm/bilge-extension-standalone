SHELL := /bin/bash

.PHONY: help standalone prep bundle runtime runtime-prod

help:
	@echo "Bilge Chrome Extension commands:"
	@echo "  make standalone   Prepare standalone sidepanel bundle"
	@echo "  make runtime      Build extension runtime scripts in-place"
	@echo "  make runtime-prod Build extension runtime scripts in-place (prod)"
	@echo "  make prep         Alias for standalone"
	@echo "  make bundle       Alias for standalone"

standalone:
	@bash tools/prepare_standalone_sidepanel_bundle.sh

runtime:
	@node build.mjs --inplace

runtime-prod:
	@node build.mjs --prod --inplace

prep: standalone

bundle: standalone
